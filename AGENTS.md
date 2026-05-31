# Agent guide

Orientation for AI/LLM sessions working in this repo. Read this first, then
`docs/ARCHITECTURE.md` for the deep dive and `docs/DEPLOY.md` for ops.

## What Outvie is

Self-hosted retro-game library. Upload NES/SNES/Genesis ROMs once, play them in
any browser. A React SPA runs the games locally via WASM libretro (nostalgist);
an optional Rust engine streams server-side libretro over WebSocket when cores
are installed. A Bun API gates the ROM library and per-user save states behind
SSO.

## Conventions (non-negotiable)

These match the maintainer's global rules — follow them or the change will be
rejected:

- **Functional style.** Avoid classes. Prefer plain functions and modules.
- **Bun, not Node/npm.** `bun run`, `bun test`, `bunx`. Never `npm`/`node`.
- **File names are lowercase**, no spaces, no `-`, no `_`, no camelCase/PascalCase.
- **No dashed/underscored names** like `user-profile.ts`. Use a folder:
  `user/{index.ts, profile.ts}`. This is why almost every module is `index.ts`
  inside a named directory.
- **Small, hyper-focused files.** One concern per file.
- **Never mention AI tooling** (Claude, Anthropic, etc.) in commit messages, PR
  text, or code. The maintainer handles all git operations — do not commit or
  push unless explicitly asked.

## Layout

```
apps/server/   Bun API + SPA host + WS proxy to the engine (composition root: src/index.ts)
apps/web/      React 19 + Mantine v7 SPA (Vite)
packages/core/ shared types: Game, System, systemMeta
packages/library/ ROM ingest, paths, store, title parsing
engine/        Rust streaming engine (libretro → WebSocket)
migrations/    SQL migrations (<seq>_<name>/{up,down}.sql), run by @atlas/migrate
scripts/       dev.ts (parallel dev), seed.ts (bulk ROM import), entrypoint.sh
```

## Commands

```sh
bun run dev          # server + web together
bun run dev:web      # SPA only (Vite)
bun run dev:server   # API only
bun run dev:engine   # Rust engine (cargo)
bun run build        # build web then server
bun run check        # biome lint  (run before finishing any change)
bun run tidy         # biome --write (autofix)
bun test
```

Always run `bun run check` after edits. CSS and TS/TSX are both linted by biome.

## Display / scaling (the player viewport)

The emulator picture must scale like a remote-desktop viewport: fill the
available cell, preserve aspect ratio, no overflow. The pieces:

- `apps/web/src/play/index.tsx` — outer CSS grid `gridTemplateRows: "minmax(0, 1fr) auto"`.
  The `minmax(0, 1fr)` is load-bearing: without it the player row grows past the
  viewport and pushes the HUD off-screen on large monitors.
- `apps/web/src/play/stage.tsx` — `.outvie-player` wrapper with a bare `<canvas>`
  (no inline width/height).
- `apps/web/src/theme/global.css` — `.outvie-player canvas` uses
  `width/height: 100%` + `object-fit: contain` so the drawing buffer scales up or
  down inside the cell. **Do not** revert this to `width/height: auto` with only
  `max-*: 100%` — that pins the canvas to its tiny intrinsic buffer size
  (e.g. 256×240) and leaves it stranded in the middle of big screens.
- Canvas buffer size is set by nostalgist (`size: "auto"`, local) or by
  `session.width/height` (remote streaming, `emulator/remote/index.ts`). CSS only
  scales the presentation; never hardcode display pixel dimensions.

## Gotchas

- Route order in `apps/server/src/routes/index.ts`: `/api/games/:id/saves` must be
  registered before `/api/games/:id` or the param route shadows it.
- ROM bytes can't carry an `Authorization` header from `<source src>`, so
  `romGuard` also accepts `?token=`; `api.romUrl(id)` appends it.
- Streaming mode has no save-state round-trip yet (libretro writes shared SRAM
  server-side). Local mode does per-user save states through the API.
- The engine failing to start (no libretro cores) is expected — the SPA falls
  back to local WASM automatically.
