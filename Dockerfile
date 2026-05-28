# syntax=docker/dockerfile:1.7

# Stage 1: build the Rust streaming engine
FROM rust:1-bookworm AS engine
WORKDIR /src
COPY engine ./engine
WORKDIR /src/engine
RUN --mount=type=cache,target=/usr/local/cargo/registry \
    --mount=type=cache,target=/src/engine/target \
    cargo build --release && \
    cp target/release/outvie-engine /usr/local/bin/outvie-engine

# Stage 2: build the web SPA
FROM oven/bun:1 AS web
WORKDIR /src
COPY package.json bun.lock ./
COPY atlas ./atlas
COPY packages ./packages
COPY apps/web ./apps/web
RUN bun install --frozen-lockfile
RUN cd apps/web && bun run build

# Stage 3: runtime
FROM oven/bun:1-slim
WORKDIR /app

# Runtime deps:
#  - tini + ca-certs: process supervision + TLS roots
#  - libretro-* : drop-in emulator cores loaded by the engine for SNES + Genesis
#    (live in Debian's non-free component)
RUN echo "deb http://deb.debian.org/debian bookworm main contrib non-free non-free-firmware" \
      > /etc/apt/sources.list.d/contrib-nonfree.list \
  && apt-get update \
  && apt-get install -y --no-install-recommends \
       ca-certificates \
       tini \
       libretro-snes9x \
       libretro-genesis-plus-gx \
  && rm -rf /var/lib/apt/lists/*

COPY package.json bun.lock ./
COPY atlas ./atlas
COPY packages ./packages
COPY apps/server ./apps/server
# Keep apps/web's package.json so workspace resolution succeeds in the runtime install.
COPY apps/web/package.json ./apps/web/package.json
COPY scripts/entrypoint.sh /entrypoint.sh
COPY --from=web /src/apps/web/dist ./web
COPY --from=engine /usr/local/bin/outvie-engine /usr/local/bin/outvie-engine

RUN bun install --frozen-lockfile --production
RUN chmod +x /entrypoint.sh

ENV PORT=4290 \
    HOST=0.0.0.0 \
    ENGINE_URL=http://127.0.0.1:4291 \
    OUTVIE_ENGINE_HOST=127.0.0.1 \
    OUTVIE_ENGINE_PORT=4291 \
    OUTVIE_CORE_SNES=/usr/lib/libretro/snes9x_libretro.so \
    OUTVIE_CORE_GENESIS=/usr/lib/libretro/genesis_plus_gx_libretro.so \
    WEB_ROOT=/app/web \
    DATA_DIR=/data \
    DATABASE_PATH=/data/outvie.db

EXPOSE 4290
VOLUME ["/data"]

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:4290/api/health || exit 1

ENTRYPOINT ["/usr/bin/tini", "--", "/entrypoint.sh"]
