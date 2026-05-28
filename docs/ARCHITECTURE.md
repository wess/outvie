# Architecture

Outvie is a single-container Bun service with a Rust sidecar (the streaming engine), backed by Postgres and a data volume. The browser SPA does most of the work via WASM; the server is a thin authenticated gateway around the ROM library and per-user save state.

## Processes

| Process | Entry | Port | Role |
|---|---|---|---|
| API + web (Bun) | `apps/server/src/index.ts` | 4290 | Serves `/api/*`, `/auth/sso/*`, and the SPA bundle from `WEB_ROOT` |
| Streaming engine (Rust) | `outvie-engine` | 4291 | Loads libretro cores, exposes `/v1/sessions/...` over HTTP+WebSocket |

The Rust engine is started in the same container as a background process by `scripts/entrypoint.sh`. If the binary fails to start (e.g. no libretro cores installed), the engine just doesn't respond and the SPA gracefully falls back to local WASM emulation.

## Request pipeline

`apps/server/src/index.ts` is the composition root:

1. Reads typed config via `defineConfig` + `env` from `@atlas/config`.
2. Opens a Postgres connection through `@atlas/db` and runs every pending migration in `migrations/` via `@atlas/migrate`.
3. Wires the route set in `apps/server/src/routes/index.ts`. Order matters — `/api/games/:id/saves` is registered before `/api/games/:id` so the dynamic-param route doesn't shadow it.
4. `Bun.serve` dispatches:
   - WebSocket upgrades → `tryStreamUpgrade` proxies to the Rust engine.
   - `/api/*` and `/auth/sso/*` → the atlas router (handles CORS, auth, JSON serialization).
   - Everything else → the static SPA handler (`spa.ts`) reading from `WEB_ROOT`.

Auth lives in `apps/server/src/auth/index.ts`:
- `guard(secret)` is a thin wrapper around `@atlas/auth#requireAuth` that 401s on missing/invalid Bearer tokens.
- `authId(c)` extracts the user id from `c.assigns.auth.sub`.
- `issueToken(claims, secret)` mints a 7-day JWT carrying `{ sub, email, username, name, is_owner }`.

SSO lives in `apps/server/src/sso/index.ts`:
- `setupOutvieSso(db, env)` returns the four `mountSso` routes (login, callback, logout, backchannel-logout).
- `onAuthenticated` upserts the local users row from the IdP claims. The first user to sign in is auto-promoted to `is_owner`.
- `issueSession` issues a 7-day JWT and 302s the browser to `/#token=<jwt>`. The SPA's `adoptToken` picks the token off the URL fragment and stores it in `localStorage`.

## Data model

Three tables. All migrations live in `migrations/<seq>_<name>/{up,down}.sql` and are tracked by `@atlas/migrate` in `schema_migrations`.

### users (`migrations/00000001_init`)

| Column | Type | Notes |
|---|---|---|
| `id` | serial | PK |
| `email` | text unique | normalized lowercase |
| `username` | text unique | normalized from `preferred_username` claim |
| `name` | text | display |
| `password` | text | sentinel hash — SSO is the only login path |
| `is_owner` | bool | first SSO user auto-promoted |
| `created_at` / `updated_at` | timestamptz | |

### games (`migrations/00000001_init`)

| Column | Type | Notes |
|---|---|---|
| `id` | text | short random; matches on-disk filename `<system>/<id><ext>` |
| `owner_id` | int → users(id) | who uploaded — audit only, doesn't gate access (shared library) |
| `title` | text | parsed from upload filename or backfilled from SQLite import |
| `system` | text | `nes` / `snes` / `genesis` (sniffed from header bytes) |
| `filename` | text | original upload filename |
| `size` | bigint | ROM size in bytes |
| `sha1` | text unique | dedup key |
| `added_at` | timestamptz | |

### game_saves (`migrations/00000002_saves`)

| Column | Type | Notes |
|---|---|---|
| `id` | serial | PK |
| `user_id` | int → users(id) | cascade-delete |
| `game_id` | text → games(id) | cascade-delete |
| `slot` | int | 0 = quick-save, 1-9 reserved for future named slots |
| `size` | bigint | bytes |
| `label` | text nullable | user-supplied tag |
| `created_at` / `updated_at` | timestamptz | |
| `UNIQUE(user_id, game_id, slot)` | | one row per slot per user per game |

The actual state blob lives on disk at `DATA_DIR/saves/<user_id>/<game_id>-<slot>.state`. Postgres holds the metadata; the file is written by the API on `POST /api/games/:id/saves/:slot` and served back on `GET …`.

## Web ↔ API auth dance

The SPA is a hash-token consumer. The auth bootstrap:

1. App mounts → checks `localStorage["outvie.token"]`.
2. If absent, render `<SignedOut>` with a "Sign in with Castle" button.
3. Button → `window.location.assign("/auth/sso/login")`.
4. Server-side: castle 302 round-trip → returns to `/auth/sso/callback?code=…` → server exchanges code for tokens, issues a JWT, 302s to `/#token=<jwt>`.
5. App mounts again → `window.location.hash` starts with `#token=` → `adoptToken(t)` stores it + fetches `/api/me` to load the user.
6. Subsequent API calls send `Authorization: Bearer <jwt>` via the api/auth helper.

For ROM bytes specifically, the browser can't attach an Authorization header to a `<source src="…">` or `<img src="…">` request. The server-side `romGuard` accepts the JWT either as `Authorization: Bearer …` *or* as a `?token=…` query string; `api.romUrl(id)` appends the token automatically.

## Per-user save state flow

Local-mode play (WASM):

1. User hits the Save icon in the HUD.
2. `player.saveState()` (nostalgist) returns a `Blob` of the libretro state snapshot.
3. `uploadSave(gameId, 0, blob)` POSTs the bytes to `/api/games/:id/saves/0` with the JWT.
4. The API writes the blob to disk under the user's saves dir, upserts the metadata row.
5. The HUD's `quickSave` state updates so the Load button enables.

Loading:

1. User hits Load.
2. `downloadSave(gameId, 0)` fetches the blob.
3. `player.loadState(file)` hands it back to nostalgist.

Streaming mode doesn't currently route save states through the API — libretro on the server writes its own SRAM at `DATA_DIR/saves/<system>/<gameId>.sav` (single shared file per game; future work to scope this per user too).

## SPA structure

```
apps/web/src/
├── api/
│   ├── index.ts      — fetch wrappers, JWT-aware
│   └── auth.ts       — localStorage + adoptToken + ssoLogin
├── app/
│   ├── index.tsx     — App: phase machine for "adopting / ready / anonymous"
│   └── shell.tsx     — Mantine AppShell with header (sign-out, etc.)
├── emulator/
│   ├── local/        — nostalgist wrapper
│   └── remote/       — WebSocket → engine bridge
├── library/
│   ├── index.tsx     — search + system filter + grid
│   ├── grid.tsx      — responsive SimpleGrid
│   ├── card.tsx      — per-game tile
│   └── upload.tsx    — chunked upload modal
└── play/
    ├── index.tsx     — game page (Stage + HUD in a CSS grid)
    ├── stage.tsx     — canvas + mode badge + gamepad badge
    ├── hud.tsx       — pause, mode switch, save/load
    └── gamepad.ts    — Web Gamepad API hook
```

## Where the things live in production

| Concern | Location |
|---|---|
| ROM files | `/data/roms/<system>/<id><ext>` on the `vegeta_outvie-data` volume |
| User saves | `/data/saves/<userId>/<gameId>-<slot>.state` on the same volume |
| Database | `vegeta-postgres-1` (shared with castle/tangle/stohr), database `outvie`, owner `outvie` |
| Container | `vegeta-outvie-1` from compose service `outvie` |
| Edge routing | `outvie.local` and `arcade.local` → `127.0.0.1:4290`, registered via castle's `/api/routes` (castled writes the nginx vhost into `/etc/castle/nginx-routes/`) |
| OAuth client | row in castle's `oauth_clients` table with both callback URIs |
| SSO env | `OUTVIE_SSO_CLIENT_ID` / `OUTVIE_SSO_CLIENT_SECRET` in `/opt/services/.env` |
