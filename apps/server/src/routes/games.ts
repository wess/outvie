import { mkdir, rename } from "node:fs/promises"
import { dirname, extname } from "node:path"
import { del, get, halt, json, patch, pipeline, post, text } from "@atlas/server"
import { type GamePatch, ingestRom, romPath } from "@outvie/library"
import { authId, guard, ownerGuard } from "../auth/index.ts"
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

type System = "nes" | "snes" | "genesis"

type PatchBody = { title?: unknown; system?: unknown }

// Validate and normalise an inbound metadata patch. Drops unknown keys,
// rejects an empty/whitespace title and an unrecognised system.
const parsePatch = (body: PatchBody): { ok: true; patch: GamePatch } | { ok: false; error: string } => {
  const out: GamePatch = {}
  if (body.title !== undefined) {
    if (typeof body.title !== "string") return { ok: false, error: "title_must_be_string" }
    const trimmed = body.title.trim()
    if (!trimmed) return { ok: false, error: "title_required" }
    out.title = trimmed
  }
  if (body.system !== undefined) {
    if (typeof body.system !== "string" || !KNOWN_SYSTEMS.has(body.system)) {
      return { ok: false, error: "unknown_system" }
    }
    out.system = body.system as System
  }
  if (out.title === undefined && out.system === undefined) {
    return { ok: false, error: "no_fields" }
  }
  return { ok: true, patch: out }
}

// When the system classification changes, the ROM lives under a different
// system directory, so move the file to keep romPath() resolvable.
const moveRomForSystem = async (
  dataDir: string,
  filename: string,
  id: string,
  fromSystem: System,
  toSystem: System,
): Promise<void> => {
  if (fromSystem === toSystem) return
  const ext = extname(filename).toLowerCase() || ".bin"
  const src = romPath(dataDir, fromSystem, id, ext)
  const dst = romPath(dataDir, toSystem, id, ext)
  if (!(await Bun.file(src).exists())) return
  await mkdir(dirname(dst), { recursive: true })
  await rename(src, dst)
}

// Outvie on the homelab is a shared library — any signed-in user sees
// every game. owner_id stays on the row for audit (who uploaded it) but
// doesn't gate visibility or access.
export const gamesRoutes = (secret: string) => [
  get(
    "/api/games",
    pipeline(guard(secret))(async (c) => {
      const { store } = app()
      const sys = c.query.system
      const system = sys && KNOWN_SYSTEMS.has(sys) ? (sys as "nes" | "snes" | "genesis") : undefined
      return json(c, 200, await store.list({ system }))
    }),
  ),

  get(
    "/api/games/:id",
    pipeline(guard(secret))(async (c) => {
      const id = c.params.id
      if (!id) return halt(c, 400, { error: "id required" })
      const game = await app().store.get(id)
      if (!game) return halt(c, 404, { error: "not found" })
      return json(c, 200, game)
    }),
  ),

  post(
    "/api/games",
    pipeline(ownerGuard(secret))(async (c) => {
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

  patch(
    "/api/games/:id",
    pipeline(ownerGuard(secret))(async (c) => {
      const id = c.params.id
      if (!id) return halt(c, 400, { error: "id required" })
      const { store, cfg } = app()
      const game = await store.get(id)
      if (!game) return halt(c, 404, { error: "not found" })

      const body = (await c.request.json().catch(() => ({}))) as PatchBody
      const parsed = parsePatch(body)
      if (!parsed.ok) return halt(c, 400, { error: parsed.error })

      if (parsed.patch.system && parsed.patch.system !== game.system) {
        await moveRomForSystem(cfg.dataDir, game.filename, game.id, game.system, parsed.patch.system)
      }
      const updated = await store.update(game.id, parsed.patch)
      if (!updated) return halt(c, 404, { error: "not found" })
      return json(c, 200, updated)
    }),
  ),

  del(
    "/api/games/:id",
    pipeline(ownerGuard(secret))(async (c) => {
      const id = c.params.id
      if (!id) return halt(c, 400, { error: "id required" })
      const game = await app().store.get(id)
      if (!game) return halt(c, 404, { error: "not found" })
      await app().store.remove(game.id)
      return text(c, 204, "")
    }),
  ),
]
