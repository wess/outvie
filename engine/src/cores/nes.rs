use std::path::Path;

use anyhow::{Context, Result};
use tetanes_core::{
    common::{Reset, ResetKind},
    control_deck::{Config, ControlDeck},
    input::{JoypadBtn, Player},
};

use super::{Button, Core};

fn anyhow_from<E: std::fmt::Display>(err: E) -> anyhow::Error {
    anyhow::anyhow!("{err}")
}

const WIDTH: u32 = 256;
const HEIGHT: u32 = 240;
const BYTES: usize = (WIDTH * HEIGHT * 4) as usize;
const FPS: u32 = 60;
const SAMPLE_RATE: u32 = 44_100;

pub struct NesCore {
    deck: ControlDeck,
}

pub fn load(rom: &Path) -> Result<Box<dyn Core>> {
    let mut deck = ControlDeck::with_config(Config::default());
    deck.load_rom_path(rom).with_context(|| format!("loading rom {}", rom.display()))?;
    Ok(Box::new(NesCore { deck }))
}

fn player(p: u8) -> Player {
    match p {
        2 => Player::Two,
        3 => Player::Three,
        4 => Player::Four,
        _ => Player::One,
    }
}

fn map(btn: Button) -> Option<JoypadBtn> {
    match btn {
        Button::Up => Some(JoypadBtn::Up),
        Button::Down => Some(JoypadBtn::Down),
        Button::Left => Some(JoypadBtn::Left),
        Button::Right => Some(JoypadBtn::Right),
        Button::A => Some(JoypadBtn::A),
        Button::B => Some(JoypadBtn::B),
        Button::Start => Some(JoypadBtn::Start),
        Button::Select => Some(JoypadBtn::Select),
        Button::X | Button::Y | Button::L | Button::R => None,
    }
}

fn f32_to_i16(v: f32) -> i16 {
    let clamped = v.clamp(-1.0, 1.0);
    (clamped * i16::MAX as f32) as i16
}

impl Core for NesCore {
    fn dims(&self) -> (u32, u32) {
        (WIDTH, HEIGHT)
    }

    fn fps(&self) -> u32 {
        FPS
    }

    fn sample_rate(&self) -> u32 {
        SAMPLE_RATE
    }

    fn clock_frame(&mut self) -> Result<()> {
        self.deck.clock_frame()?;
        Ok(())
    }

    fn frame_buffer(&mut self) -> &[u8] {
        let bytes = self.deck.frame_buffer();
        debug_assert_eq!(bytes.len(), BYTES);
        bytes
    }

    fn drain_audio(&mut self) -> Vec<i16> {
        let samples = self.deck.audio_samples();
        if samples.is_empty() {
            return Vec::new();
        }
        // tetanes outputs mono f32 samples; duplicate to stereo to match libretro
        // and the client's AudioWorklet processor.
        let mut out = Vec::with_capacity(samples.len() * 2);
        for s in samples {
            let v = f32_to_i16(*s);
            out.push(v);
            out.push(v);
        }
        self.deck.clear_audio_samples();
        out
    }

    fn set_button(&mut self, player_id: u8, button: Button, pressed: bool) {
        if let Some(btn) = map(button) {
            self.deck.joypad_mut(player(player_id)).set_button(btn, pressed);
        }
    }

    fn reset(&mut self) {
        self.deck.reset(ResetKind::Soft);
    }

    fn load_battery(&mut self, path: &Path) -> Result<()> {
        if matches!(self.deck.cart_battery_backed(), Some(true)) && path.is_file() {
            self.deck.load_sram(path).map_err(anyhow_from)?;
        }
        Ok(())
    }

    fn save_battery(&mut self, path: &Path) -> Result<()> {
        if matches!(self.deck.cart_battery_backed(), Some(true)) {
            if let Some(parent) = path.parent() {
                std::fs::create_dir_all(parent).ok();
            }
            self.deck.save_sram(path).map_err(anyhow_from)?;
        }
        Ok(())
    }
}
