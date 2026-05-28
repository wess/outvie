import { putHeader, type PipeFn } from "@atlas/server"

export const cors =
  (origin: string): PipeFn =>
  (c) => {
    let next = putHeader(c, "access-control-allow-origin", origin)
    next = putHeader(next, "access-control-allow-credentials", "true")
    next = putHeader(next, "access-control-allow-headers", "content-type, x-filename")
    next = putHeader(next, "access-control-allow-methods", "GET, POST, DELETE, OPTIONS")
    next = putHeader(next, "access-control-expose-headers", "content-length, content-range, accept-ranges")
    return next
  }

export const withCors = (res: Response, origin: string): Response => {
  const headers = new Headers(res.headers)
  headers.set("access-control-allow-origin", origin)
  headers.set("access-control-allow-credentials", "true")
  headers.set("access-control-expose-headers", "content-length, content-range, accept-ranges")
  return new Response(res.body, { status: res.status, headers })
}
