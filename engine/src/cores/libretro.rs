use std::{
    cell::RefCell,
    ffi::{c_char, c_void, CStr, CString},
    fs,
    path::Path,
    ptr, slice,
};

use anyhow::{anyhow, Context, Result};
use libloading::{Library, Symbol};

use super::{Button, Core};

const MEMORY_SAVE_RAM: u32 = 0;

// Libretro constants (from libretro.h)
const ENV_SET_PIXEL_FORMAT: u32 = 10;
const ENV_GET_SYSTEM_DIRECTORY: u32 = 9;
const ENV_GET_SAVE_DIRECTORY: u32 = 31;
const ENV_GET_VARIABLE: u32 = 15;
const ENV_GET_VARIABLE_UPDATE: u32 = 17;
const ENV_GET_LOG_INTERFACE: u32 = 27;
const ENV_GET_INPUT_BITMASKS: u32 = 51;
const ENV_GET_CAN_DUPE: u32 = 28;
const ENV_SHUTDOWN: u32 = 7;
const ENV_SET_PERFORMANCE_LEVEL: u32 = 8;
const ENV_SET_INPUT_DESCRIPTORS: u32 = 18;
const ENV_SET_CONTROLLER_INFO: u32 = 35;

const PIXEL_FORMAT_XRGB8888: u32 = 1;

const DEVICE_JOYPAD: u32 = 1;
const JOY_B: u32 = 0;
const JOY_Y: u32 = 1;
const JOY_SELECT: u32 = 2;
const JOY_START: u32 = 3;
const JOY_UP: u32 = 4;
const JOY_DOWN: u32 = 5;
const JOY_LEFT: u32 = 6;
const JOY_RIGHT: u32 = 7;
const JOY_A: u32 = 8;
const JOY_X: u32 = 9;
const JOY_L: u32 = 10;
const JOY_R: u32 = 11;
const JOY_MAX: usize = 16;
const MAX_PLAYERS: usize = 2;

#[repr(C)]
struct RetroGameInfo {
    path: *const c_char,
    data: *const c_void,
    size: usize,
    meta: *const c_char,
}

#[repr(C)]
#[derive(Default, Clone, Copy)]
struct RetroSystemTiming {
    fps: f64,
    sample_rate: f64,
}

#[repr(C)]
#[derive(Default, Clone, Copy)]
struct RetroGameGeometry {
    base_width: u32,
    base_height: u32,
    max_width: u32,
    max_height: u32,
    aspect_ratio: f32,
}

#[repr(C)]
#[derive(Default, Clone, Copy)]
struct RetroSystemAvInfo {
    geometry: RetroGameGeometry,
    timing: RetroSystemTiming,
}

type EnvFn = unsafe extern "C" fn(cmd: u32, data: *mut c_void) -> bool;
type VideoRefreshFn = unsafe extern "C" fn(data: *const c_void, width: u32, height: u32, pitch: usize);
type AudioSampleFn = unsafe extern "C" fn(left: i16, right: i16);
type AudioSampleBatchFn = unsafe extern "C" fn(data: *const i16, frames: usize) -> usize;
type InputPollFn = unsafe extern "C" fn();
type InputStateFn = unsafe extern "C" fn(port: u32, device: u32, index: u32, id: u32) -> i16;

struct Funcs {
    init: unsafe extern "C" fn(),
    deinit: unsafe extern "C" fn(),
    api_version: unsafe extern "C" fn() -> u32,
    set_environment: unsafe extern "C" fn(EnvFn),
    set_video_refresh: unsafe extern "C" fn(VideoRefreshFn),
    set_audio_sample: unsafe extern "C" fn(AudioSampleFn),
    set_audio_sample_batch: unsafe extern "C" fn(AudioSampleBatchFn),
    set_input_poll: unsafe extern "C" fn(InputPollFn),
    set_input_state: unsafe extern "C" fn(InputStateFn),
    load_game: unsafe extern "C" fn(info: *const RetroGameInfo) -> bool,
    unload_game: unsafe extern "C" fn(),
    run: unsafe extern "C" fn(),
    get_system_av_info: unsafe extern "C" fn(info: *mut RetroSystemAvInfo),
    reset: unsafe extern "C" fn(),
    get_memory_data: unsafe extern "C" fn(id: u32) -> *mut c_void,
    get_memory_size: unsafe extern "C" fn(id: u32) -> usize,
}

struct Ctx {
    width: u32,
    height: u32,
    fps: u32,
    sample_rate: u32,
    frame: Vec<u8>,
    audio: Vec<i16>,
    input: [[bool; JOY_MAX]; MAX_PLAYERS],
    system_dir_c: CString,
    save_dir_c: CString,
    rom_bytes: Vec<u8>,
}

pub struct LibretroCore {
    _library: Library,
    funcs: Funcs,
    ctx: Box<Ctx>,
}

// The core itself is single-threaded; we only move the box across threads when
// spinning up a session. All callbacks happen on that single thread.
unsafe impl Send for LibretroCore {}

thread_local! {
    static CURRENT: RefCell<Option<*mut Ctx>> = const { RefCell::new(None) };
}

fn with_ctx<R>(default: R, f: impl FnOnce(&mut Ctx) -> R) -> R {
    CURRENT.with(|cell| match *cell.borrow() {
        Some(ptr) if !ptr.is_null() => unsafe { f(&mut *ptr) },
        _ => default,
    })
}

unsafe extern "C" fn cb_env(cmd: u32, data: *mut c_void) -> bool {
    match cmd {
        ENV_SET_PIXEL_FORMAT => {
            if data.is_null() {
                return false;
            }
            let fmt = *(data as *const u32);
            fmt == PIXEL_FORMAT_XRGB8888
        }
        ENV_GET_SYSTEM_DIRECTORY => with_ctx(false, |ctx| {
            *(data as *mut *const c_char) = ctx.system_dir_c.as_ptr();
            true
        }),
        ENV_GET_SAVE_DIRECTORY => with_ctx(false, |ctx| {
            *(data as *mut *const c_char) = ctx.save_dir_c.as_ptr();
            true
        }),
        ENV_GET_CAN_DUPE => {
            if !data.is_null() {
                *(data as *mut bool) = true;
            }
            true
        }
        ENV_GET_VARIABLE | ENV_GET_VARIABLE_UPDATE => false,
        ENV_GET_INPUT_BITMASKS => false,
        ENV_GET_LOG_INTERFACE => false,
        ENV_SET_PERFORMANCE_LEVEL | ENV_SET_INPUT_DESCRIPTORS | ENV_SET_CONTROLLER_INFO | ENV_SHUTDOWN => true,
        _ => false,
    }
}

unsafe extern "C" fn cb_video(data: *const c_void, width: u32, height: u32, pitch: usize) {
    if data.is_null() || width == 0 || height == 0 {
        return;
    }
    with_ctx((), |ctx| {
        if width != ctx.width || height != ctx.height {
            ctx.width = width;
            ctx.height = height;
            ctx.frame = vec![0u8; (width * height * 4) as usize];
        }
        let src = std::slice::from_raw_parts(data as *const u8, pitch * height as usize);
        let row_bytes = (width as usize) * 4;
        for y in 0..height as usize {
            let s_off = y * pitch;
            let d_off = y * row_bytes;
            for x in 0..width as usize {
                let src_idx = s_off + x * 4;
                let dst_idx = d_off + x * 4;
                // Libretro XRGB8888 (little-endian) memory layout: B G R X
                let b = src[src_idx];
                let g = src[src_idx + 1];
                let r = src[src_idx + 2];
                ctx.frame[dst_idx] = r;
                ctx.frame[dst_idx + 1] = g;
                ctx.frame[dst_idx + 2] = b;
                ctx.frame[dst_idx + 3] = 0xff;
            }
        }
    });
}

unsafe extern "C" fn cb_audio_sample(left: i16, right: i16) {
    with_ctx((), |ctx| {
        ctx.audio.push(left);
        ctx.audio.push(right);
    });
}

unsafe extern "C" fn cb_audio_sample_batch(data: *const i16, frames: usize) -> usize {
    if data.is_null() || frames == 0 {
        return frames;
    }
    let stereo_count = frames * 2;
    with_ctx((), |ctx| {
        let slice = std::slice::from_raw_parts(data, stereo_count);
        ctx.audio.extend_from_slice(slice);
    });
    frames
}

unsafe extern "C" fn cb_input_poll() {}

unsafe extern "C" fn cb_input_state(port: u32, device: u32, _index: u32, id: u32) -> i16 {
    if device != DEVICE_JOYPAD {
        return 0;
    }
    let port = port as usize;
    let id = id as usize;
    if port >= MAX_PLAYERS || id >= JOY_MAX {
        return 0;
    }
    with_ctx(0, |ctx| if ctx.input[port][id] { 1 } else { 0 })
}

fn map(button: Button) -> Option<u32> {
    Some(match button {
        Button::Up => JOY_UP,
        Button::Down => JOY_DOWN,
        Button::Left => JOY_LEFT,
        Button::Right => JOY_RIGHT,
        Button::A => JOY_A,
        Button::B => JOY_B,
        Button::X => JOY_X,
        Button::Y => JOY_Y,
        Button::L => JOY_L,
        Button::R => JOY_R,
        Button::Start => JOY_START,
        Button::Select => JOY_SELECT,
    })
}

pub fn load(core_path: &Path, rom_path: &Path) -> Result<Box<dyn Core>> {
    unsafe { load_inner(core_path, rom_path) }
}

unsafe fn load_inner(core_path: &Path, rom_path: &Path) -> Result<Box<dyn Core>> {
    let library = Library::new(core_path)
        .with_context(|| format!("dlopen {}", core_path.display()))?;

    let funcs = Funcs {
        init: *get_sym::<unsafe extern "C" fn()>(&library, b"retro_init")?,
        deinit: *get_sym::<unsafe extern "C" fn()>(&library, b"retro_deinit")?,
        api_version: *get_sym::<unsafe extern "C" fn() -> u32>(&library, b"retro_api_version")?,
        set_environment: *get_sym(&library, b"retro_set_environment")?,
        set_video_refresh: *get_sym(&library, b"retro_set_video_refresh")?,
        set_audio_sample: *get_sym(&library, b"retro_set_audio_sample")?,
        set_audio_sample_batch: *get_sym(&library, b"retro_set_audio_sample_batch")?,
        set_input_poll: *get_sym(&library, b"retro_set_input_poll")?,
        set_input_state: *get_sym(&library, b"retro_set_input_state")?,
        load_game: *get_sym(&library, b"retro_load_game")?,
        unload_game: *get_sym(&library, b"retro_unload_game")?,
        run: *get_sym(&library, b"retro_run")?,
        get_system_av_info: *get_sym(&library, b"retro_get_system_av_info")?,
        reset: *get_sym(&library, b"retro_reset")?,
        get_memory_data: *get_sym(&library, b"retro_get_memory_data")?,
        get_memory_size: *get_sym(&library, b"retro_get_memory_size")?,
    };

    let api = (funcs.api_version)();
    if api != 1 {
        return Err(anyhow!("unsupported libretro api version: {api}"));
    }

    let rom_bytes = fs::read(rom_path)
        .with_context(|| format!("reading rom {}", rom_path.display()))?;

    let mut ctx = Box::new(Ctx {
        width: 0,
        height: 0,
        fps: 60,
        sample_rate: 0,
        frame: Vec::new(),
        audio: Vec::new(),
        input: [[false; JOY_MAX]; MAX_PLAYERS],
        system_dir_c: CString::new("/tmp")?,
        save_dir_c: CString::new("/tmp")?,
        rom_bytes,
    });

    let ctx_ptr: *mut Ctx = ctx.as_mut();
    CURRENT.with(|cell| *cell.borrow_mut() = Some(ctx_ptr));

    (funcs.set_environment)(cb_env);
    (funcs.set_video_refresh)(cb_video);
    (funcs.set_audio_sample)(cb_audio_sample);
    (funcs.set_audio_sample_batch)(cb_audio_sample_batch);
    (funcs.set_input_poll)(cb_input_poll);
    (funcs.set_input_state)(cb_input_state);

    (funcs.init)();

    let path_c = CString::new(rom_path.to_string_lossy().as_bytes())?;
    let info = RetroGameInfo {
        path: path_c.as_ptr(),
        data: ctx.rom_bytes.as_ptr() as *const c_void,
        size: ctx.rom_bytes.len(),
        meta: ptr::null(),
    };
    let loaded = (funcs.load_game)(&info);
    if !loaded {
        (funcs.deinit)();
        return Err(anyhow!("core refused to load rom {}", rom_path.display()));
    }
    drop(path_c);

    let mut av = RetroSystemAvInfo::default();
    (funcs.get_system_av_info)(&mut av);

    let initial_w = if av.geometry.base_width > 0 { av.geometry.base_width } else { 256 };
    let initial_h = if av.geometry.base_height > 0 { av.geometry.base_height } else { 224 };
    let fps = if av.timing.fps > 0.0 { av.timing.fps.round() as u32 } else { 60 };
    let sample_rate = if av.timing.sample_rate > 0.0 { av.timing.sample_rate.round() as u32 } else { 0 };

    ctx.width = initial_w;
    ctx.height = initial_h;
    ctx.fps = fps;
    ctx.sample_rate = sample_rate;
    ctx.frame = vec![0u8; (initial_w * initial_h * 4) as usize];

    Ok(Box::new(LibretroCore { _library: library, funcs, ctx }))
}

unsafe fn get_sym<'lib, T>(lib: &'lib Library, name: &[u8]) -> Result<Symbol<'lib, T>> {
    Ok(lib.get::<T>(name).with_context(|| {
        format!(
            "resolving libretro symbol `{}`",
            CStr::from_bytes_with_nul(name)
                .map(|c| c.to_string_lossy().into_owned())
                .unwrap_or_else(|_| String::from_utf8_lossy(name).into_owned())
        )
    })?)
}

impl Core for LibretroCore {
    fn dims(&self) -> (u32, u32) {
        (self.ctx.width, self.ctx.height)
    }

    fn fps(&self) -> u32 {
        self.ctx.fps
    }

    fn sample_rate(&self) -> u32 {
        self.ctx.sample_rate
    }

    fn clock_frame(&mut self) -> anyhow::Result<()> {
        let ctx_ptr: *mut Ctx = self.ctx.as_mut();
        CURRENT.with(|cell| *cell.borrow_mut() = Some(ctx_ptr));
        unsafe { (self.funcs.run)() };
        Ok(())
    }

    fn frame_buffer(&mut self) -> &[u8] {
        &self.ctx.frame
    }

    fn drain_audio(&mut self) -> Vec<i16> {
        std::mem::take(&mut self.ctx.audio)
    }

    fn set_button(&mut self, player_id: u8, button: Button, pressed: bool) {
        if let Some(id) = map(button) {
            let port = match player_id {
                2 => 1,
                _ => 0,
            };
            if let Some(slot) = self.ctx.input.get_mut(port).and_then(|row| row.get_mut(id as usize)) {
                *slot = pressed;
            }
        }
    }

    fn reset(&mut self) {
        let ctx_ptr: *mut Ctx = self.ctx.as_mut();
        CURRENT.with(|cell| *cell.borrow_mut() = Some(ctx_ptr));
        unsafe { (self.funcs.reset)() };
    }

    fn load_battery(&mut self, path: &Path) -> Result<()> {
        if !path.is_file() {
            return Ok(());
        }
        let size = unsafe { (self.funcs.get_memory_size)(MEMORY_SAVE_RAM) };
        let data = unsafe { (self.funcs.get_memory_data)(MEMORY_SAVE_RAM) };
        if size == 0 || data.is_null() {
            return Ok(());
        }
        let bytes = fs::read(path).with_context(|| format!("reading sram {}", path.display()))?;
        let n = bytes.len().min(size);
        unsafe {
            let dst = slice::from_raw_parts_mut(data as *mut u8, size);
            dst[..n].copy_from_slice(&bytes[..n]);
        }
        Ok(())
    }

    fn save_battery(&mut self, path: &Path) -> Result<()> {
        let size = unsafe { (self.funcs.get_memory_size)(MEMORY_SAVE_RAM) };
        let data = unsafe { (self.funcs.get_memory_data)(MEMORY_SAVE_RAM) };
        if size == 0 || data.is_null() {
            return Ok(());
        }
        let bytes = unsafe { slice::from_raw_parts(data as *const u8, size) };
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).ok();
        }
        let tmp = path.with_extension("sav.tmp");
        fs::write(&tmp, bytes).with_context(|| format!("writing sram {}", tmp.display()))?;
        fs::rename(&tmp, path).with_context(|| format!("renaming sram {}", path.display()))?;
        Ok(())
    }
}

impl Drop for LibretroCore {
    fn drop(&mut self) {
        let ctx_ptr: *mut Ctx = self.ctx.as_mut();
        CURRENT.with(|cell| *cell.borrow_mut() = Some(ctx_ptr));
        unsafe {
            (self.funcs.unload_game)();
            (self.funcs.deinit)();
        }
        CURRENT.with(|cell| *cell.borrow_mut() = None);
    }
}
