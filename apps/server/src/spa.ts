import { join, normalize } from "node:path"

const types: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".wasm": "application/wasm",
  ".map": "application/json",
}

const contentTypeFor = (path: string): string => {
  const dot = path.lastIndexOf(".")
  if (dot < 0) return "application/octet-stream"
  return types[path.slice(dot).toLowerCase()] ?? "application/octet-stream"
}

const safeJoin = (root: string, requested: string): string | null => {
  const decoded = decodeURIComponent(requested)
  const joined = normalize(join(root, decoded))
  if (!joined.startsWith(normalize(root))) return null
  return joined
}

export const spa = (root: string) => async (req: Request): Promise<Response> => {
  const url = new URL(req.url)
  const requested = url.pathname === "/" ? "/index.html" : url.pathname
  const path = safeJoin(root, requested)

  if (path) {
    const file = Bun.file(path)
    if (await file.exists()) {
      return new Response(file, { headers: { "content-type": contentTypeFor(path) } })
    }
  }

  const fallback = Bun.file(join(root, "index.html"))
  if (await fallback.exists()) {
    return new Response(fallback, { headers: { "content-type": "text/html; charset=utf-8" } })
  }
  return new Response("Not Found", { status: 404 })
}
