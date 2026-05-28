use std::path::Path;

use anyhow::Result;
use serde::{Deserialize, Serialize};

pub mod libretro;
pub mod nes;

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Hash)]
#[serde(rename_all = "lowercase")]
pub enum System {
    Nes,
    Snes,
    Genesis,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Button {
    Up,
    Down,
    Left,
    Right,
    A,
    B,
    X,
    Y,
    L,
    R,
    Start,
    Select,
}

pub trait Core: Send {
    fn dims(&self) -> (u32, u32);
    fn fps(&self) -> u32;
    fn sample_rate(&self) -> u32 {
        0
    }
    fn clock_frame(&mut self) -> Result<()>;
    fn frame_buffer(&mut self) -> &[u8];
    fn drain_audio(&mut self) -> Vec<i16> {
        Vec::new()
    }
    fn set_button(&mut self, player: u8, button: Button, pressed: bool);
    fn reset(&mut self);
    fn load_battery(&mut self, _path: &Path) -> Result<()> {
        Ok(())
    }
    fn save_battery(&mut self, _path: &Path) -> Result<()> {
        Ok(())
    }
}

