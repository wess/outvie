import { del, get, halt, json, pipeline, post, text } from "@atlas/server"
import { ingestRom } from "@outvie/library"
import { authId, guard } from "../auth/index.ts"
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

const KNOWN_SYSTEMS = new Set(["nes", "snes", "genesis"])

export const gamesRoutes = (secret: string) => [
  get(
    "/api/games",
    pipeline(guard(secret))(async (c) => {
      const ownerId = authId(c)
      const { store } = app()
      const sys = c.query.system
      const system = sys && KNOWN_SYSTEMS.has(sys) ? (sys as "nes" | "snes" | "genesis") : undefined
      return json(c, 200, await store.list({ system, ownerId }))
    }),
  ),

  get(
    "/api/games/:id",
    pipeline(guard(secret))(async (c) => {
      const ownerId = authId(c)
      const id = c.params.id
      if (!id) return halt(c, 400, { error: "id required" })
      const game = await app().store.get(id)
      if (!game) return halt(c, 404, { error: "not found" })
      // Ownership scope — a game's owner is the only one who can see it.
      // System-owned (NULL owner) rows are accessible to everyone, mostly
      // for back-compat with the pre-auth library.
      const owner = await ownerOf(id)
      if (owner !== null && owner !== ownerId) return halt(c, 404, { error: "not found" })
      return json(c, 200, game)
    }),
  ),

  post(
    "/api/games",
    pipeline(guard(secret))(async (c) => {
      const ownerId = authId(c)
      const { store, cfg } = app()
      const body = c.request.body
      if (!body) return halt(c, 400, { error: "empty body" })

      const filename = filenameFrom(c.request)
      const result = await ingestRom({
        filename,
        stream: body,
        dataRoot: cfg.dataDir,
        store,
        ownerId,
      })

      if (!result.ok) {
        const status = result.reason === "unsupported" ? 415 : 400
        return halt(c, status, { ok: false, reason: result.reason, filename })
      }
      return json(c, result.deduped ? 200 : 201, {
        ok: true,
        game: result.game,
        deduped: result.deduped,
      })
    }),
  ),

  del(
    "/api/games/:id",
    pipeline(guard(secret))(async (c) => {
      const ownerId = authId(c)
      const id = c.params.id
      if (!id) return halt(c, 400, { error: "id required" })
      const game = await app().store.get(id)
      if (!game) return halt(c, 404, { error: "not found" })
      const owner = await ownerOf(id)
      if (owner !== null && owner !== ownerId) return halt(c, 404, { error: "not found" })
      await app().store.remove(game.id)
      return text(c, 204, "")
    }),
  ),
]

const ownerOf = async (gameId: string): Promise<number | null> => {
  const row = (await app().db.one({
    text: "SELECT owner_id FROM games WHERE id = $1",
    values: [gameId],
  })) as { owner_id: number | null } | null
  return row?.owner_id ?? null
}
