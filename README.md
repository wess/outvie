# Outvie

**Self-hosted retro-game library for the household.** Upload your NES / SNES / Genesis ROMs once, then play them in any browser on any device — phone, tablet, big monitor, whatever — with controller support, per-user save states, and SSO.

```sh
git clone https://github.com/wess/outvie && cd outvie
cp env.example .env
docker compose up -d
open http://localhost:4290
```

The first user to sign in becomes the owner.

---

## Why Outvie?

You've got a closet full of cartridges and a NAS sitting in the basement. Outvie keeps your library on your hardware, plays the games in any modern browser via WASM (or streams from a Rust-backed libretro engine on the server when you've got cores installed), and gates everything behind your own SSO so visitors can play but only your account can manage the library.

- **All-WASM by default** — no plugins, no native installs, just open the URL and play.
- **Streaming-ready** — the Rust engine ships in the image; drop libretro cores into `/usr/lib/libretro` to enable server-side rendering with low-latency input over WebSockets.
- **Per-user saves** — save states live in a per-user folder so your kid's checkpoint doesn't clobber your speedrun.
- **Controller-aware** — standard gamepad layout works out of the box; the HUD shows what's plugged in.
- **One Docker container, one Postgres** — no microservice graveyard.

---

## Architecture at a glance

```
            ┌─────────────────────────────────────────────┐
            │ Browser                                     │
            │  - Mantine SPA                              │
            │  - WASM libretro (nostalgist) for local play│
            │  - Web Gamepad API → libretro inputs        │
            └────────────────┬────────────────────────────┘
                             │  HTTP/WS · JWT
            ┌────────────────┴───────────────────────────┐
            │ outvie API (Bun)                           │
            │  - /api/games (CRUD, library list)         │
            │  - /api/games/:id/rom (RNG + range)        │
            │  - /api/games/:id/saves (per-user states)  │
            │  - /api/stream/sessions (WS proxy)         │
            │  - /auth/sso/* (@atlas/sso)                │
            └─────┬────────────────┬────────────┬────────┘
                  │                │            │
            ┌─────┴────┐    ┌──────┴───┐  ┌─────┴────────┐
            │ Postgres │    │ /data    │  │ outvie-engine│
            │ users,   │    │ roms/    │  │ (Rust + libretro)
            │ games,   │    │ saves/   │  │              │
            │ saves    │    │ states/  │  └──────────────┘
            └──────────┘    └──────────┘
```

ROMs are stored on disk as `data/roms/<system>/<id><ext>`; only metadata is in Postgres. Save states live at `data/saves/<userId>/<gameId>-<slot>.state` so users never see each other's progress.

---

## Stack

- **Server**: Bun + TypeScript + [@atlas/server](https://github.com/wess/atlas)
- **Database**: Postgres 16, accessed via `@atlas/db` (no ORM, fluent SQL)
- **Auth/SSO**: `@atlas/auth` JWTs + `@atlas/sso` (OIDC relying-party). Castle is the IdP in the homelab setup.
- **Web**: React 19 + Mantine v7 + nostalgist (libretro for the browser)
- **Engine**: Rust libretro frontend that streams a32 WebM video over WebSockets (optional)
- **Migrations**: `@atlas/migrate` runs `migrations/*/up.sql` on boot

---

## Endpoints

| Method | Path | What |
|---|---|---|
| `GET`  | `/api/health` | Liveness |
| `GET`  | `/api/me` | Current user (auth) |
| `GET`  | `/auth/sso/login` | Kick the OIDC flow → 302 to IdP |
| `GET`  | `/auth/sso/callback` | OIDC code exchange → 302 home with `#token=<jwt>` |
| `GET`  | `/api/games?system=…` | List all games (auth, shared library) |
| `GET`  | `/api/games/:id` | One game's metadata |
| `POST` | `/api/games` | Upload (stream of raw bytes; `X-Filename` header) |
| `DELETE` | `/api/games/:id` | Remove |
| `GET`  | `/api/games/:id/rom` | Download ROM bytes — Bearer **or** `?token=` for `<source>` tags |
| `GET`  | `/api/games/:id/saves` | List the signed-in user's saves for that game |
| `GET`  | `/api/games/:id/saves/:slot` | Download one save (slot 0 = quick-save) |
| `POST` | `/api/games/:id/saves/:slot` | Upload save bytes (optional `?label=`) |
| `DELETE` | `/api/games/:id/saves/:slot` | Remove a save |
| `POST` | `/api/stream/sessions` | Spin up a libretro session (returns `wsPath`) |
| `DELETE` | `/api/stream/sessions/:id` | Tear down |

All `/api/*` routes require `Authorization: Bearer <jwt>`.

---

## Configuration

Set these in `.env` (see `env.example`):

| Var | Default | Purpose |
|---|---|---|
| `PORT` | `4290` | HTTP listen port |
| `DATABASE_URL` | `postgres://postgres:postgres@127.0.0.1:5432/outvie` | Postgres |
| `SECRET` | dev-only | JWT signing secret |
| `DATA_DIR` | `./data` | Where ROMs and saves live on disk |
| `WEB_ROOT` | unset | If set, serve the SPA bundle from this path; otherwise unset means API-only |
| `ENGINE_URL` | `http://127.0.0.1:4291` | Rust streaming engine |
| `APP_URL` | `http://outvie.local` | Browser-facing URL |
| `SSO_ISSUER` | unset | OIDC issuer URL — SSO mounts only if all three are set |
| `SSO_CLIENT_ID` | unset | OAuth client id at the IdP |
| `SSO_CLIENT_SECRET` | unset | Client secret |
| `OUTVIE_CORE_SNES` | `/usr/lib/libretro/snes9x_libretro.so` | Path to SNES libretro core (server streaming) |
| `OUTVIE_CORE_GENESIS` | `/usr/lib/libretro/genesis_plus_gx_libretro.so` | Path to Genesis core |

---

## Local dev

```sh
bun install
docker run -d --name pg -p 5432:5432 -e POSTGRES_PASSWORD=postgres postgres:16-alpine
docker exec -i pg psql -U postgres -c "CREATE DATABASE outvie;"
bun run dev:server   # API on :4290
bun run dev:web      # SPA on :5174
```

Open `http://localhost:5174`. Without `SSO_*` env vars the server requires Bearer JWTs but won't mount the relying-party — easiest local dev path is to point at a castle instance:

```sh
SSO_ISSUER=http://castle.local SSO_CLIENT_ID=… SSO_CLIENT_SECRET=… bun run dev:server
```

---

## Deploy

```sh
docker compose up -d
```

Image is published as `vegeta-outvie` in our homelab compose stack — see `docs/DEPLOY.md` for the vegeta-on-castle pattern (Postgres role provisioning, nginx vhosts via castled, OAuth client minting).

---

## Bulk-import ROMs

To seed a fresh library from a folder of cartridges-on-disk:

```sh
OWNER_ID=1 DATA_DIR=./data DATABASE_URL=postgres://… \
  bun scripts/seed.ts ~/Downloads/roms
```

The seed walks the source, sha1-dedupes, sniffs system from header bytes, and `mv`s files into the canonical `data/roms/<system>/<id><ext>` layout. Skips anything it can't identify. ~2.5 s for 1,500 ROMs.

---

## Docs

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — request pipeline, auth/SSO, data model
- [`docs/DEPLOY.md`](docs/DEPLOY.md) — homelab deploy on castle/vegeta

---

## License

Apache 2.0 — see [`LICENSE`](LICENSE).
