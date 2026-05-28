use std::{
    path::PathBuf,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc,
    },
    thread,
    time::{Duration, Instant},
};

use anyhow::Result;
use bytes::{Bytes, BytesMut};
use parking_lot::Mutex;
use tokio::{
    sync::{broadcast, mpsc},
    task::JoinHandle,
};

use crate::{
    catalog::open_core,
    cores::{Button, System},
};

// Binary message kind prefix (first byte of every binary WS frame).
pub const KIND_VIDEO: u8 = 0x00;
pub const KIND_AUDIO: u8 = 0x01;
pub const KIND_VIDEO_ZSTD: u8 = 0x02;

// Level 1 trades a few percent of ratio for ~3-5x throughput. On 256x240 RGBA
// (245 KB) it consistently lands a frame in <2 ms on modern CPUs, which is
// well under the 16 ms frame budget.
const ZSTD_LEVEL: i32 = 1;

#[derive(Debug, Clone)]
pub enum Outbound {
    Binary(Bytes),
    Text(String),
}

#[derive(Debug, Clone, Copy)]
pub enum Command {
    Input { player: u8, button: Button, pressed: bool },
    Reset,
    Pause,
    Resume,
}

pub struct Session {
    pub id: String,
    pub system: System,
    pub width: u32,
    pub height: u32,
    pub fps: u32,
    pub sample_rate: u32,
    tx_cmd: mpsc::UnboundedSender<Command>,
    rx_frame: broadcast::Sender<Outbound>,
    shutdown: Arc<AtomicBool>,
    join: Mutex<Option<JoinHandle<()>>>,
}

pub struct SessionSpec {
    pub id: String,
    pub system: System,
    pub rom_path: PathBuf,
    pub save_path: Option<PathBuf>,
}

const SRAM_AUTOSAVE_INTERVAL: Duration = Duration::from_secs(30);

fn pack(kind: u8, payload: &[u8]) -> Bytes {
    let mut buf = BytesMut::with_capacity(1 + payload.len());
    buf.extend_from_slice(&[kind]);
    buf.extend_from_slice(payload);
    buf.freeze()
}

fn pack_video(frame: &[u8]) -> Bytes {
    match zstd::bulk::compress(frame, ZSTD_LEVEL) {
        Ok(compressed) if compressed.len() + 1 < frame.len() => pack(KIND_VIDEO_ZSTD, &compressed),
        _ => pack(KIND_VIDEO, frame),
    }
}

fn pack_audio(samples: &[i16]) -> Bytes {
    let bytes_len = samples.len() * 2;
    let mut buf = BytesMut::with_capacity(1 + bytes_len);
    buf.extend_from_slice(&[KIND_AUDIO]);
    for s in samples {
        buf.extend_from_slice(&s.to_le_bytes());
    }
    buf.freeze()
}

fn resize_message(width: u32, height: u32) -> String {
    serde_json::json!({ "type": "resize", "width": width, "height": height }).to_string()
}

pub async fn spawn(spec: SessionSpec) -> Result<Session> {
    let mut core = open_core(spec.system, &spec.rom_path)?;
    let (width, height) = core.dims();
    let fps = core.fps();
    let sample_rate = core.sample_rate();

    if let Some(path) = spec.save_path.as_ref() {
        if let Err(err) = core.load_battery(path) {
            tracing::warn!(target: "engine.session", id = %spec.id, "load_battery failed: {err:#}");
        }
    }

    let (tx_cmd, mut rx_cmd) = mpsc::unbounded_channel::<Command>();
    let (tx_out, _rx0) = broadcast::channel::<Outbound>(16);

    let shutdown = Arc::new(AtomicBool::new(false));
    let shutdown_loop = shutdown.clone();
    let tx_out_task = tx_out.clone();
    let id_for_log = spec.id.clone();
    let save_path = spec.save_path.clone();

    let join = tokio::task::spawn_blocking(move || {
        let mut core = core;
        let save_path = save_path;
        let mut last_save = Instant::now();
        let frame_period = if fps > 0 {
            Duration::from_secs_f64(1.0 / fps as f64)
        } else {
            Duration::from_micros(16_666)
        };
        let mut next_tick = Instant::now() + frame_period;
        let mut paused = false;
        let mut last_dims = core.dims();

        while !shutdown_loop.load(Ordering::Relaxed) {
            while let Ok(cmd) = rx_cmd.try_recv() {
                match cmd {
                    Command::Input { player, button, pressed } => {
                        core.set_button(player, button, pressed);
                    }
                    Command::Reset => core.reset(),
                    Command::Pause => paused = true,
                    Command::Resume => paused = false,
                }
            }

            if !paused {
                if let Err(err) = core.clock_frame() {
                    tracing::error!(target: "engine.session", id = %id_for_log, "frame error: {err:#}");
                    break;
                }

                let dims_now = core.dims();
                if dims_now != last_dims {
                    last_dims = dims_now;
                    let _ = tx_out_task.send(Outbound::Text(resize_message(dims_now.0, dims_now.1)));
                }

                if tx_out_task.receiver_count() > 0 {
                    let frame = core.frame_buffer();
                    if !frame.is_empty() {
                        let _ = tx_out_task.send(Outbound::Binary(pack_video(frame)));
                    }
                    let audio = core.drain_audio();
                    if !audio.is_empty() {
                        let _ = tx_out_task.send(Outbound::Binary(pack_audio(&audio)));
                    }
                } else {
                    // Drain the core's audio buffer even when no client is connected
                    // so it doesn't grow unbounded.
                    let _ = core.drain_audio();
                }
            }

            if let Some(path) = save_path.as_ref() {
                if last_save.elapsed() >= SRAM_AUTOSAVE_INTERVAL {
                    if let Err(err) = core.save_battery(path) {
                        tracing::warn!(target: "engine.session", id = %id_for_log, "autosave failed: {err:#}");
                    }
                    last_save = Instant::now();
                }
            }

            let now = Instant::now();
            if next_tick > now {
                thread::sleep(next_tick - now);
            } else if now - next_tick > frame_period * 4 {
                next_tick = now;
            }
            next_tick += frame_period;
        }

        if let Some(path) = save_path.as_ref() {
            if let Err(err) = core.save_battery(path) {
                tracing::warn!(target: "engine.session", id = %id_for_log, "final save failed: {err:#}");
            }
        }
        tracing::info!(target: "engine.session", id = %id_for_log, "session loop exited");
    });

    Ok(Session {
        id: spec.id,
        system: spec.system,
        width,
        height,
        fps,
        sample_rate,
        tx_cmd,
        rx_frame: tx_out,
        shutdown,
        join: Mutex::new(Some(join)),
    })
}

impl Session {
    pub fn subscribe(&self) -> broadcast::Receiver<Outbound> {
        self.rx_frame.subscribe()
    }

    pub fn send(&self, cmd: Command) {
        let _ = self.tx_cmd.send(cmd);
    }

    pub fn shutdown(&self) {
        self.shutdown.store(true, Ordering::Relaxed);
        if let Some(handle) = self.join.lock().take() {
            handle.abort();
        }
    }
}

impl Drop for Session {
    fn drop(&mut self) {
        self.shutdown.store(true, Ordering::Relaxed);
    }
}
