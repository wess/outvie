# syntax=docker/dockerfile:1.7

# ─────────────────────────────────────────────────────────────────────
# Outvie — single-container image. The server (Bun) handles the API,
# proxies websockets to the Rust engine (also in this image, started
# alongside), and serves the pre-built SPA from /app/web.
#
# Build: `docker compose build outvie` (from the vegeta /opt/services
# stack). The pre-build of the SPA happens via Vite during the web
# stage; the API bundle is the source tree run by `bun`.
# ─────────────────────────────────────────────────────────────────────

# Stage 1: build the Rust streaming engine.
FROM rust:1-bookworm AS engine
WORKDIR /src
COPY engine ./engine
WORKDIR /src/engine
RUN --mount=type=cache,target=/usr/local/cargo/registry \
    --mount=type=cache,target=/src/engine/target \
    cargo build --release && \
    cp target/release/outvie-engine /usr/local/bin/outvie-engine

# Stage 2: build the web SPA with Vite. atlas is fetched as a bun dep
# via github: — needs git.
FROM oven/bun:1 AS web
WORKDIR /src
RUN apt-get update && apt-get install -y --no-install-recommends git && rm -rf /var/lib/apt/lists/*
COPY package.json bun.lock tsconfig.json ./
COPY packages ./packages
COPY apps/web ./apps/web
# apps/server's package.json is needed for workspace resolution since
# the root package.json includes "apps/*" in workspaces.
COPY apps/server/package.json ./apps/server/package.json
RUN bun install
RUN cd apps/web && bun run build

# Stage 3: runtime.
FROM oven/bun:1-slim
WORKDIR /app

# Runtime deps:
#  - tini + ca-certs: process supervision + TLS roots
#  - git: bun install needs it to fetch atlas from github:wess/atlas
#
# Server-side libretro cores are NOT bundled — the homelab deploy
# doesn't render to a screen, it only stores ROMs. The browser-side
# WASM player (nostalgist) handles emulation client-side. The Rust
# engine binary is still built and started so a future stream-mode
# deployment can drop cores into /usr/lib/libretro and have them
# picked up automatically.
RUN apt-get update \
  && apt-get install -y --no-install-recommends \
       ca-certificates \
       git \
       tini \
  && rm -rf /var/lib/apt/lists/*

COPY package.json bun.lock tsconfig.json ./
COPY packages ./packages
COPY apps/server ./apps/server
COPY migrations ./migrations
COPY scripts/entrypoint.sh /entrypoint.sh
# Keep apps/web's package.json so workspace resolution succeeds.
COPY apps/web/package.json ./apps/web/package.json
COPY --from=web /src/apps/web/dist ./web
COPY --from=engine /usr/local/bin/outvie-engine /usr/local/bin/outvie-engine

RUN bun install --production
RUN chmod +x /entrypoint.sh

ENV PORT=4290 \
    HOST=0.0.0.0 \
    NODE_ENV=production \
    ENGINE_URL=http://127.0.0.1:4291 \
    OUTVIE_ENGINE_HOST=127.0.0.1 \
    OUTVIE_ENGINE_PORT=4291 \
    OUTVIE_CORE_SNES=/usr/lib/libretro/snes9x_libretro.so \
    OUTVIE_CORE_GENESIS=/usr/lib/libretro/genesis_plus_gx_libretro.so \
    WEB_ROOT=/app/web \
    DATA_DIR=/data

EXPOSE 4290
VOLUME ["/data"]

# bun is the only HTTP-capable tool in the slim runtime image (no wget/curl),
# so probe with it directly.
HEALTHCHECK --interval=30s --timeout=3s --start-period=15s --retries=3 \
  CMD bun -e 'fetch("http://127.0.0.1:4290/api/health").then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))'

ENTRYPOINT ["/usr/bin/tini", "--", "/entrypoint.sh"]
