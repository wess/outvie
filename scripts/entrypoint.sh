#!/bin/sh
set -e

mkdir -p "${DATA_DIR:-/data}/roms/nes" "${DATA_DIR:-/data}/roms/snes" \
         "${DATA_DIR:-/data}/saves" "${DATA_DIR:-/data}/states"

/usr/local/bin/outvie-engine &
ENGINE_PID=$!

trap 'kill -TERM "$ENGINE_PID" 2>/dev/null || true' INT TERM EXIT

exec bun run /app/apps/server/src/index.ts
