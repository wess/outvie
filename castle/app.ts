// Castle catalog entry for Outvie.
// Drop this object into ~/Desktop/castle/packages/apps/src/catalog.ts to make
// Outvie installable from the Castle dashboard.

import type { AppTemplate } from "@castle/apps"

export const outvie: AppTemplate = {
  id: "outvie",
  name: "Outvie",
  description: "Self-hosted retro game library with NES/SNES emulation and Luna-style server-side streaming.",
  category: "Gaming",
  icon: "gamepad-2",
  docs: "https://github.com/wess/outvie",
  multi: false,
  services: [
    {
      key: "outvie",
      role: "primary",
      image: "wess/outvie:main",
      ports: [{ container: 4290, primary: true }],
      env: {
        WEB_ORIGIN: "http://${INSTANCE}.local",
        DATA_DIR: "/data",
        DATABASE_PATH: "/data/outvie.db",
        ENGINE_URL: "http://127.0.0.1:4291",
        OUTVIE_CORE_SNES: "/usr/lib/libretro/snes9x_libretro.so",
        OUTVIE_CORE_GENESIS: "/usr/lib/libretro/genesis_plus_gx_libretro.so",
      },
      volumes: [{ name: "data", target: "/data" }],
    },
  ],
}
