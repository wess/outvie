import { mkdir } from "node:fs/promises"
import { dirname, extname, resolve } from "node:path"
import { del, halt, json, pipeline, post } from "@atlas/server"
import { romPath, savePath } from "@outvie/library"
import { authId, guard } from "../auth/index.ts"
import { app } from "../state.ts"

type CreateBody = { gameId?: string }

type EngineSession = {
  id: string
  system: "nes" | "snes" | "genesis"
  width: number
  height: number
  fps: number
  sampleRate: number
  wsPath: string
}

const fetchEngine = async (cfg: { engineUrl: string }, path: string, init?: RequestInit) => {
  const res = await fetch(`${cfg.engineUrl}${path}`, init)
  const text = await res.text()
  return { status: res.status, body: text }
}

export const streamRoutes = (secret: string) => [
  post(
    "/api/stream/sessions",
    pipeline(guard(secret))(async (c) => {
      const ownerId = authId(c)
      const { store, cfg, db } = app()
      const body = (await c.request.json().catch(() => ({}))) as CreateBody
      if (!body.gameId) return halt(c, 400, { error: "gameId required" })

      const owner = (await db.one({
        text: "SELECT owner_id FROM games WHERE id = $1",
        values: [body.gameId],
      })) as { owner_id: number | null } | null
      if (owner && owner.owner_id !== null && owner.owner_id !== ownerId) {
        return halt(c, 404, { error: "game not found" })
      }

      const game = await store.get(body.gameId)
      if (!game) return halt(c, 404, { error: "game not found" })

      const ext = extname(game.filename).toLowerCase() || ".bin"
      const absoluteRomPath = resolve(romPath(cfg.dataDir, game.system, game.id, ext))
      if (!(await Bun.file(absoluteRomPath).exists())) return halt(c, 410, { error: "rom missing on disk" })

      const absoluteSavePath = resolve(savePath(cfg.dataDir, game.system, game.id))
      await mkdir(dirname(absoluteSavePath), { recursive: true })

      const engineRes = await fetchEngine(cfg, "/v1/sessions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          system: game.system,
          romPath: absoluteRomPath,
          savePath: absoluteSavePath,
        }),
      })

      if (engineRes.status >= 400) {
        return json(c, engineRes.status, {
          error: "engine refused session",
          detail: engineRes.body,
          fallback: "local",
          game: { id: game.id, system: game.system },
        })
      }

      const parsed = JSON.parse(engineRes.body) as EngineSession
      return json(c, 201, {
        id: parsed.id,
        system: parsed.system,
        width: parsed.width,
        height: parsed.height,
        fps: parsed.fps,
        sampleRate: parsed.sampleRate,
        wsPath: `/api/stream/sessions/${parsed.id}/ws`,
        game: { id: game.id, title: game.title, system: game.system },
      })
    }),
  ),

  del(
    "/api/stream/sessions/:id",
    pipeline(guard(secret))(async (c) => {
      const id = c.params.id
      if (!id) return halt(c, 400, { error: "id required" })
      const { cfg } = app()
      const engineRes = await fetchEngine(cfg, `/v1/sessions/${encodeURIComponent(id)}`, { method: "DELETE" })
      return json(c, engineRes.status === 204 ? 204 : engineRes.status, {})
    }),
  ),
]
