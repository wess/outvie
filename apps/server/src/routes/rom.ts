import { extname } from "node:path"
import { token } from "@atlas/auth"
import { assign, type Conn, get, halt, pipe, pipeline, putHeader } from "@atlas/server"
import { romPath } from "@outvie/library"
import type { AuthClaims } from "../auth/index.ts"
import { app } from "../state.ts"

// ROM-specific guard. Accepts either an `Authorization: Bearer …` header
// (the SPA's fetch path) or a `?token=…` query parameter (the WASM
// emulator path, which loads via <source src="…"> and can't set headers).
const romGuard = (secret: string) =>
  pipe(async (c: Conn) => {
    const url = new URL(c.request.url)
    const authHeader = c.headers.get("authorization")
    const bearer = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null
    const t = bearer ?? url.searchParams.get("token")
    if (!t) {
      return halt(c, 401, {
        error: "Missing token. Pass Authorization: Bearer <jwt> or ?token=<jwt>.",
      })
    }
    try {
      const claims = (await token.verify(t, secret)) as AuthClaims
      return assign(c, { auth: claims })
    } catch {
      return halt(c, 401, { error: "Invalid or expired token." })
    }
  })

// Parse an HTTP Range header against a known resource size. Returns a
// resolved [start, end] (inclusive) for a 206 response, or null to fall
// back to a full 200. Handles open-ended `bytes=N-`, clamps the end to the
// last byte, and rejects ranges where start > end or the header is malformed.
export type ResolvedRange = { start: number; end: number }

export const computeRange = (range: string | null, size: number): ResolvedRange | null => {
  if (!range) return null
  const match = /bytes=(\d+)-(\d*)/.exec(range)
  if (!match) return null
  const start = Number(match[1])
  const end = match[2] ? Math.min(Number(match[2]), size - 1) : size - 1
  if (start > end) return null
  return { start, end }
}

const setHeaders = (c: Conn, entries: Record<string, string>): Conn => {
  let next = c
  for (const [k, v] of Object.entries(entries)) next = putHeader(next, k, v)
  return next
}

const sendStream = (c: Conn, status: number, stream: ReadableStream<Uint8Array>): Conn => ({
  ...c,
  status,
  body: stream,
})

export const romRoutes = (secret: string) => [
  get(
    "/api/games/:id/rom",
    pipeline(romGuard(secret))(async (c) => {
      const id = c.params.id
      if (!id) return halt(c, 400, { error: "id required" })

      const game = await app().store.get(id)
      if (!game) return halt(c, 404, { error: "not found" })

      const ext = extname(game.filename).toLowerCase() || ".bin"
      const path = romPath(app().cfg.dataDir, game.system, game.id, ext)
      const file = Bun.file(path)
      if (!(await file.exists())) return halt(c, 410, { error: "rom missing" })

      const size = file.size
      const range = c.headers.get("range")
      const withMeta = setHeaders(c, {
        "content-type": "application/octet-stream",
        "accept-ranges": "bytes",
        "content-disposition": `attachment; filename="${encodeURIComponent(game.filename)}"`,
      })

      const resolved = computeRange(range, size)
      if (resolved) {
        const { start, end } = resolved
        const sliced = file.slice(start, end + 1)
        const ranged = setHeaders(withMeta, {
          "content-range": `bytes ${start}-${end}/${size}`,
          "content-length": String(end - start + 1),
        })
        return sendStream(ranged, 206, sliced.stream())
      }

      const final = putHeader(withMeta, "content-length", String(size))
      return sendStream(final, 200, file.stream())
    }),
  ),
]
