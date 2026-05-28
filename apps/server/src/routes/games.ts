import { del, get, json, pipe, post, text } from "@atlas/server"
import { ingestRom } from "@outvie/library"
import { app } from "../state.ts"

const filenameFrom = (req: Request): string => {
  const header = req.headers.get("x-filename")
  if (header) {
    try {
      return decodeURIComponent(header)
    } catch {
      return header
    }
  }
  const url = new URL(req.url)
  const fromQuery = url.searchParams.get("name")
  if (fromQuery) return fromQuery
  return "upload.bin"
}

export const gamesRoutes = [
  get(
    "/api/games",
    pipe(async (c) => {
      const { store } = app()
      const sys = c.query.system
      if (sys === "nes" || sys === "snes") return json(c, 200, store.list(sys))
      return json(c, 200, store.list())
    }),
  ),

  get(
    "/api/games/:id",
    pipe(async (c) => {
      const id = c.params.id
      if (!id) return json(c, 400, { error: "id required" })
      const game = app().store.get(id)
      if (!game) return json(c, 404, { error: "not found" })
      return json(c, 200, game)
    }),
  ),

  post(
    "/api/games",
    pipe(async (c) => {
      const { store, cfg } = app()
      const body = c.request.body
      if (!body) return json(c, 400, { error: "empty body" })

      const filename = filenameFrom(c.request)
      const result = await ingestRom({
        filename,
        stream: body,
        dataRoot: cfg.dataDir,
        store,
      })

      if (!result.ok) {
        const status = result.reason === "unsupported" ? 415 : 400
        return json(c, status, { ok: false, reason: result.reason, filename })
      }
      return json(c, result.deduped ? 200 : 201, { ok: true, game: result.game, deduped: result.deduped })
    }),
  ),

  del(
    "/api/games/:id",
    pipe(async (c) => {
      const id = c.params.id
      if (!id) return json(c, 400, { error: "id required" })
      const { store } = app()
      const game = store.get(id)
      if (!game) return json(c, 404, { error: "not found" })
      store.remove(game.id)
      return text(c, 204, "")
    }),
  ),
]
