import { mkdir } from "node:fs/promises"
import { dirname, extname, resolve } from "node:path"
import { del, json, pipe, post } from "@atlas/server"
import { romPath, savePath } from "@outvie/library"
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

export const streamRoutes = [
  post(
    "/api/stream/sessions",
    pipe(async (c) => {
      const { store, cfg } = app()
      const body = (await c.request.json().catch(() => ({}))) as CreateBody
      if (!body.gameId) return json(c, 400, { error: "gameId required" })

      const game = store.get(body.gameId)
      if (!game) return json(c, 404, { error: "game not found" })

      const ext = extname(game.filename).toLowerCase() || ".bin"
      const absoluteRomPath = resolve(romPath(cfg.dataDir, game.system, game.id, ext))
      if (!(await Bun.file(absoluteRomPath).exists())) return json(c, 410, { error: "rom missing on disk" })

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
    pipe(async (c) => {
      const id = c.params.id
      if (!id) return json(c, 400, { error: "id required" })
      const { cfg } = app()
      const engineRes = await fetchEngine(cfg, `/v1/sessions/${encodeURIComponent(id)}`, { method: "DELETE" })
      return json(c, engineRes.status === 204 ? 204 : engineRes.status, {})
    }),
  ),
]
