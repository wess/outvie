import { mkdir, unlink, writeFile } from "node:fs/promises"
import { dirname, join, resolve } from "node:path"
import { del, get, halt, json, pipeline, post, putHeader } from "@atlas/server"
import { authId, guard } from "../auth/index.ts"
import { app } from "../state.ts"

// Saves live on disk under DATA_DIR/saves/<userId>/<gameId>-<slot>.state
// so postgres only carries metadata (size, label, timestamps). Filenames
// don't carry sensitive info — but we still safeJoin to make sure a
// crafted id can't escape the saves root.
const saveFilePath = (dataDir: string, userId: number, gameId: string, slot: number): string => {
  const root = resolve(join(dataDir, "saves"))
  const user = join(root, String(userId))
  const file = join(user, `${gameId}-${slot}.state`)
  const normalized = resolve(file)
  if (!normalized.startsWith(`${root}/`)) {
    throw new Error("rejected save path traversal")
  }
  return normalized
}

const ensureGameExists = async (gameId: string): Promise<boolean> => {
  const row = (await app().db.one({
    text: "SELECT 1 AS ok FROM games WHERE id = $1",
    values: [gameId],
  })) as { ok: number } | null
  return !!row
}

const parseSlot = (raw: string | undefined): number => {
  if (!raw) return 0
  const n = Number(raw)
  return Number.isFinite(n) && n >= 0 && n <= 9 ? Math.floor(n) : 0
}

type SaveRow = {
  id: number
  user_id: number
  game_id: string
  slot: number
  size: number | bigint
  label: string | null
  created_at: string | Date
  updated_at: string | Date
}

const toJson = (r: SaveRow) => ({
  id: r.id,
  game_id: r.game_id,
  slot: r.slot,
  size: typeof r.size === "bigint" ? Number(r.size) : r.size,
  label: r.label,
  created_at: typeof r.created_at === "string" ? r.created_at : r.created_at.toISOString(),
  updated_at: typeof r.updated_at === "string" ? r.updated_at : r.updated_at.toISOString(),
})

export const savesRoutes = (secret: string) => [
  // List the signed-in user's saves for one game.
  get(
    "/api/games/:id/saves",
    pipeline(guard(secret))(async (c) => {
      const userId = authId(c)
      const gameId = c.params.id
      if (!gameId) return halt(c, 400, { error: "id required" })
      const rows = (await app().db.all({
        text:
          "SELECT id, user_id, game_id, slot, size, label, created_at, updated_at " +
          "FROM game_saves WHERE user_id = $1 AND game_id = $2 ORDER BY slot ASC",
        values: [userId, gameId],
      })) as SaveRow[]
      return json(c, 200, { saves: rows.map(toJson) })
    }),
  ),

  // Download a specific save (default slot 0).
  get(
    "/api/games/:id/saves/:slot",
    pipeline(guard(secret))(async (c) => {
      const userId = authId(c)
      const gameId = c.params.id
      const slot = parseSlot(c.params.slot)
      if (!gameId) return halt(c, 400, { error: "id required" })
      const row = (await app().db.one({
        text:
          "SELECT id, user_id, game_id, slot, size, label, created_at, updated_at " +
          "FROM game_saves WHERE user_id = $1 AND game_id = $2 AND slot = $3",
        values: [userId, gameId, slot],
      })) as SaveRow | null
      if (!row) return halt(c, 404, { error: "no save" })

      const path = saveFilePath(app().cfg.dataDir, userId, gameId, slot)
      const file = Bun.file(path)
      if (!(await file.exists())) return halt(c, 410, { error: "save file missing on disk" })

      const conn = putHeader(c, "content-type", "application/octet-stream")
      const conn2 = putHeader(conn, "content-length", String(file.size))
      return { ...conn2, status: 200, body: file.stream() }
    }),
  ),

  // Upload a save. Body is the raw bytes. Slot is path-or-query.
  // Replaces any existing save at the same slot for this user+game.
  post(
    "/api/games/:id/saves/:slot",
    pipeline(guard(secret))(async (c) => {
      const userId = authId(c)
      const gameId = c.params.id
      const slot = parseSlot(c.params.slot)
      if (!gameId) return halt(c, 400, { error: "id required" })
      if (!(await ensureGameExists(gameId))) return halt(c, 404, { error: "game not found" })

      const body = c.request.body
      if (!body) return halt(c, 400, { error: "empty body" })

      // Read the whole stream into memory — save states are tiny (a few
      // hundred KB at most for SNES, much less for NES). Worth keeping
      // simple over streaming straight to disk.
      const buf = new Uint8Array(await new Response(body).arrayBuffer())
      if (buf.length === 0) return halt(c, 400, { error: "empty body" })
      if (buf.length > 16 * 1024 * 1024) return halt(c, 413, { error: "save too large" })

      const url = new URL(c.request.url)
      const label = url.searchParams.get("label") ?? null

      const path = saveFilePath(app().cfg.dataDir, userId, gameId, slot)
      await mkdir(dirname(path), { recursive: true })
      await writeFile(path, buf)

      const upserted = (await app().db.execute({
        text:
          "INSERT INTO game_saves (user_id, game_id, slot, size, label, created_at, updated_at) " +
          "VALUES ($1, $2, $3, $4, $5, NOW(), NOW()) " +
          "ON CONFLICT (user_id, game_id, slot) " +
          "DO UPDATE SET size = EXCLUDED.size, label = COALESCE(EXCLUDED.label, game_saves.label), " +
          "             updated_at = NOW() " +
          "RETURNING id, user_id, game_id, slot, size, label, created_at, updated_at",
        values: [userId, gameId, slot, buf.length, label],
      })) as SaveRow[]

      const row = upserted[0]
      if (!row) return halt(c, 500, { error: "insert failed" })
      return json(c, 201, toJson(row))
    }),
  ),

  // Delete a save (slot 0 by default).
  del(
    "/api/games/:id/saves/:slot",
    pipeline(guard(secret))(async (c) => {
      const userId = authId(c)
      const gameId = c.params.id
      const slot = parseSlot(c.params.slot)
      if (!gameId) return halt(c, 400, { error: "id required" })

      const path = saveFilePath(app().cfg.dataDir, userId, gameId, slot)
      await unlink(path).catch(() => {})
      await app().db.execute({
        text: "DELETE FROM game_saves WHERE user_id = $1 AND game_id = $2 AND slot = $3",
        values: [userId, gameId, slot],
      })
      return { ...c, status: 204, body: "" }
    }),
  ),
]
