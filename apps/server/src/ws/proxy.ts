import type { ServerWebSocket } from "bun"

type ProxyData = {
  sessionId: string
  upstreamUrl: string
  upstream: WebSocket | null
  pendingDownstream: Array<string | ArrayBufferLike>
}

type UpgradeCapable = {
  upgrade: (req: Request, opts?: { data?: unknown; headers?: HeadersInit }) => boolean
}

const PATH = /^\/api\/stream\/sessions\/([0-9a-f-]+)\/ws$/i

export const tryStreamUpgrade = (req: Request, server: UpgradeCapable, engineUrl: string): boolean => {
  const url = new URL(req.url)
  const match = PATH.exec(url.pathname)
  if (!match) return false

  const sessionId = match[1]!
  const upstreamUrl = `${engineUrl.replace(/^http/, "ws")}/v1/sessions/${encodeURIComponent(sessionId)}/ws`

  const data: ProxyData = {
    sessionId,
    upstreamUrl,
    upstream: null,
    pendingDownstream: [],
  }
  return server.upgrade(req, { data })
}

export const streamProxyWebsocket = {
  open(ws: ServerWebSocket<ProxyData>) {
    const upstream = new WebSocket(ws.data.upstreamUrl)
    upstream.binaryType = "arraybuffer"
    ws.data.upstream = upstream

    upstream.addEventListener("open", () => {
      for (const buffered of ws.data.pendingDownstream) {
        try {
          if (typeof buffered === "string") upstream.send(buffered)
          else upstream.send(buffered)
        } catch {}
      }
      ws.data.pendingDownstream = []
    })

    upstream.addEventListener("message", (event) => {
      const data = event.data
      try {
        if (typeof data === "string") ws.send(data)
        else if (data instanceof ArrayBuffer) ws.send(new Uint8Array(data))
        else if (ArrayBuffer.isView(data)) ws.send(data as Uint8Array)
      } catch {}
    })

    upstream.addEventListener("close", (event) => {
      try {
        ws.close(event.code || 1000, event.reason || "")
      } catch {}
    })

    upstream.addEventListener("error", () => {
      try {
        ws.close(1011, "engine error")
      } catch {}
    })
  },

  message(ws: ServerWebSocket<ProxyData>, raw: string | Buffer) {
    const upstream = ws.data.upstream
    const payload = typeof raw === "string" ? raw : new Uint8Array(raw).buffer
    if (!upstream || upstream.readyState !== WebSocket.OPEN) {
      ws.data.pendingDownstream.push(payload as string | ArrayBufferLike)
      return
    }
    try {
      if (typeof payload === "string") upstream.send(payload)
      else upstream.send(payload)
    } catch {}
  },

  close(ws: ServerWebSocket<ProxyData>) {
    try {
      ws.data.upstream?.close()
    } catch {}
  },
}
