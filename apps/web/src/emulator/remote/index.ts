import { decompress as zstdDecompress } from "fzstd"
import { createStreamSession, destroyStreamSession, type StreamSession } from "../../api/index.ts"
import type { Player, PlayerMount } from "../index.ts"
import { type AudioSink, createAudioSink } from "./audio.ts"
import { attachInputBridge } from "./input.ts"

type Hello = {
  type: "hello"
  id: string
  width: number
  height: number
  fps: number
  sampleRate?: number
}

type Resize = { type: "resize"; width: number; height: number }

const KIND_VIDEO = 0x00
const KIND_AUDIO = 0x01
const KIND_VIDEO_ZSTD = 0x02

const wsBase = (): string => {
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:"
  return `${proto}//${window.location.host}`
}

export const mountRemotePlayer = async ({ canvas, game, onError }: PlayerMount): Promise<Player> => {
  const created = await createStreamSession(game.id)
  if ("error" in created) {
    const note = created.fallback === "local" ? " (use local play)" : ""
    throw new Error(`${created.detail ?? created.error}${note}`)
  }
  const session: StreamSession = created

  const ctx = canvas.getContext("2d", { alpha: false })
  if (!ctx) throw new Error("2d context unavailable")
  let width = session.width
  let height = session.height
  canvas.width = width
  canvas.height = height
  ctx.imageSmoothingEnabled = false
  let imageData = ctx.createImageData(width, height)

  const ws = new WebSocket(`${wsBase()}${session.wsPath}`)
  ws.binaryType = "arraybuffer"

  let paused = false
  let audio: AudioSink | null = null

  const resizeTo = (w: number, h: number) => {
    if (w === width && h === height) return
    width = w
    height = h
    canvas.width = w
    canvas.height = h
    imageData = ctx.createImageData(w, h)
  }

  ws.onmessage = (event) => {
    if (typeof event.data === "string") {
      try {
        const msg = JSON.parse(event.data) as Hello | Resize | { type: string }
        if (msg.type === "hello") {
          const h = msg as Hello
          resizeTo(h.width, h.height)
        } else if (msg.type === "resize") {
          const r = msg as Resize
          resizeTo(r.width, r.height)
        }
      } catch {}
      return
    }
    if (paused) return
    const buf = new Uint8Array(event.data as ArrayBuffer)
    if (buf.length < 1) return
    const kind = buf[0]
    const payload = buf.subarray(1)
    if (kind === KIND_VIDEO) {
      if (payload.byteLength === imageData.data.byteLength) {
        imageData.data.set(payload)
        ctx.putImageData(imageData, 0, 0)
      }
    } else if (kind === KIND_VIDEO_ZSTD) {
      try {
        const raw = zstdDecompress(payload)
        if (raw.byteLength === imageData.data.byteLength) {
          imageData.data.set(raw)
          ctx.putImageData(imageData, 0, 0)
        }
      } catch {}
    } else if (kind === KIND_AUDIO && audio) {
      // Copy into a fresh buffer so the Int16Array view is 2-byte aligned.
      // payload.byteOffset is 1 (right after the kind prefix), which is not
      // a valid alignment for Int16Array and would throw RangeError.
      const copy = new Uint8Array(payload.byteLength)
      copy.set(payload)
      const samples = new Int16Array(copy.buffer, 0, copy.byteLength >> 1)
      audio.push(samples)
    }
  }

  ws.onerror = (e) => onError?.(e)

  const detachInput = attachInputBridge(ws, canvas)

  const open = await new Promise<boolean>((resolve) => {
    if (ws.readyState === WebSocket.OPEN) return resolve(true)
    ws.addEventListener("open", () => resolve(true), { once: true })
    ws.addEventListener("error", () => resolve(false), { once: true })
  })
  if (!open) {
    detachInput()
    void destroyStreamSession(session.id)
    throw new Error("could not connect to streaming session")
  }

  // Audio is allowed to fail silently — video-only is better than nothing.
  if (session.sampleRate > 0) {
    try {
      audio = await createAudioSink(session.sampleRate)
      // Browsers require a user gesture before audio plays. Resume on first
      // pointer/key activity in the document.
      const resumeOnce = () => {
        void audio?.resume()
        window.removeEventListener("pointerdown", resumeOnce)
        window.removeEventListener("keydown", resumeOnce)
      }
      window.addEventListener("pointerdown", resumeOnce, { once: true })
      window.addEventListener("keydown", resumeOnce, { once: true })
    } catch (err) {
      console.warn("audio sink unavailable:", err)
    }
  }

  return {
    pause: () => {
      paused = true
      try {
        ws.send(JSON.stringify({ type: "pause" }))
      } catch {}
    },
    resume: () => {
      paused = false
      try {
        ws.send(JSON.stringify({ type: "resume" }))
      } catch {}
    },
    saveState: async () => null,
    loadState: async () => {
      throw new Error("Save states are not available in streaming mode yet")
    },
    dispose: async () => {
      detachInput()
      await audio?.dispose()
      try {
        ws.close()
      } catch {}
      await destroyStreamSession(session.id)
    },
  }
}
