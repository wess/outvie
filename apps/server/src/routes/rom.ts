import { extname } from "node:path"
import { get, pipe, putHeader, type Conn } from "@atlas/server"
import { romPath } from "@outvie/library"
import { app } from "../state.ts"

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

export const romRoutes = [
  get(
    "/api/games/:id/rom",
    pipe(async (c) => {
      const id = c.params.id
      if (!id) return { ...c, status: 400, body: { error: "id required" } }
      const game = app().store.get(id)
      if (!game) return { ...c, status: 404, body: { error: "not found" } }

      const ext = extname(game.filename).toLowerCase() || ".bin"
      const path = romPath(app().cfg.dataDir, game.system, game.id, ext)
      const file = Bun.file(path)
      if (!(await file.exists())) return { ...c, status: 410, body: { error: "rom missing" } }

      const size = file.size
      const range = c.headers.get("range")
      const withMeta = setHeaders(c, {
        "content-type": "application/octet-stream",
        "accept-ranges": "bytes",
        "content-disposition": `attachment; filename="${encodeURIComponent(game.filename)}"`,
      })

      if (range) {
        const match = /bytes=(\d+)-(\d*)/.exec(range)
        if (match) {
          const start = Number(match[1])
          const end = match[2] ? Math.min(Number(match[2]), size - 1) : size - 1
          if (start <= end) {
            const sliced = file.slice(start, end + 1)
            const ranged = setHeaders(withMeta, {
              "content-range": `bytes ${start}-${end}/${size}`,
              "content-length": String(end - start + 1),
            })
            return sendStream(ranged, 206, sliced.stream())
          }
        }
      }

      const final = putHeader(withMeta, "content-length", String(size))
      return sendStream(final, 200, file.stream())
    }),
  ),
]
