import { options, router } from "@atlas/server"
import { config } from "./config.ts"
import { cors, withCors } from "./cors.ts"
import { buildRoutes } from "./routes/index.ts"
import { spa } from "./spa.ts"
import { init } from "./state.ts"
import { streamProxyWebsocket, tryStreamUpgrade } from "./ws/proxy.ts"

const cfg = config()
await init()

const preflight = options("/*", async (c) => {
  const after = cors(cfg.webOrigin)(c)
  return { ...after, status: 204 }
})

const apiHandler = router(preflight, ...buildRoutes())
const spaHandler = cfg.webRoot ? spa(cfg.webRoot) : null

const fetchHandler = async (req: Request, server: any): Promise<Response | undefined> => {
  const url = new URL(req.url)

  if (req.headers.get("upgrade") === "websocket") {
    if (tryStreamUpgrade(req, server, cfg.engineUrl)) return undefined
    return new Response("Unsupported websocket path", { status: 404 })
  }

  if (url.pathname === "/api" || url.pathname.startsWith("/api/")) {
    const res = await apiHandler(req)
    return withCors(res, cfg.webOrigin)
  }
  if (spaHandler) return spaHandler(req)
  return new Response("Not Found", { status: 404 })
}

Bun.serve({
  port: cfg.port,
  hostname: cfg.host,
  idleTimeout: 255,
  maxRequestBodySize: 4 * 1024 * 1024 * 1024,
  fetch: fetchHandler,
  websocket: streamProxyWebsocket,
})

console.log(`outvied listening on http://${cfg.host}:${cfg.port}`)
console.log(`streaming engine at ${cfg.engineUrl}`)
if (spaHandler) console.log(`serving web from ${cfg.webRoot}`)
