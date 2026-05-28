use std::{env, path::PathBuf};

use anyhow::{anyhow, Context, Result};

use crate::cores::{libretro, nes, Core, System};

pub fn open_core(system: System, rom: &PathBuf) -> Result<Box<dyn Core>> {
    match system {
        System::Nes => nes::load(rom),
        System::Snes => open_libretro(system, "OUTVIE_CORE_SNES", "snes9x_libretro", rom),
        System::Genesis => open_libretro(system, "OUTVIE_CORE_GENESIS", "genesis_plus_gx_libretro", rom),
    }
}

fn open_libretro(system: System, env_var: &str, stem: &str, rom: &PathBuf) -> Result<Box<dyn Core>> {
    let core_path = locate_core(env_var, stem)
        .with_context(|| format!("locating libretro core for {system:?}"))?;
    libretro::load(&core_path, rom)
}

fn dylib_exts() -> &'static [&'static str] {
    if cfg!(target_os = "macos") {
        &["dylib", "so"]
    } else if cfg!(target_os = "windows") {
        &["dll"]
    } else {
        &["so"]
    }
}

fn search_dirs() -> Vec<&'static str> {
    if cfg!(target_os = "macos") {
        vec![
            "/opt/homebrew/lib/libretro",
            "/usr/local/lib/libretro",
            "/Applications/RetroArch.app/Contents/Resources/cores",
            "./cores",
        ]
    } else {
        vec![
            "/usr/lib/libretro",
            "/usr/lib/x86_64-linux-gnu/libretro",
            "/usr/lib/aarch64-linux-gnu/libretro",
            "/usr/local/lib/libretro",
            "/opt/libretro",
            "./cores",
        ]
    }
}

fn locate_core(env_var: &str, stem: &str) -> Result<PathBuf> {
    if let Ok(p) = env::var(env_var) {
        let path = PathBuf::from(p);
        if path.is_file() {
            return Ok(path);
        }
        return Err(anyhow!("{env_var}={} does not exist", path.display()));
    }
    for dir in search_dirs() {
        for ext in dylib_exts() {
            let candidate = PathBuf::from(format!("{dir}/{stem}.{ext}"));
            if candidate.is_file() {
                return Ok(candidate);
            }
        }
    }
    Err(anyhow!(
        "libretro core `{stem}` not found; set {env_var} to its absolute path, or install it under one of: {}",
        search_dirs().join(", ")
    ))
}
