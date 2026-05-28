import type { Game, GameUploadResult, System } from "@outvie/core"

const base = ""

const jsonOrThrow = async <T>(res: Response): Promise<T> => {
  if (!res.ok) {
    const body = await res.text().catch(() => "")
    throw new Error(`request failed (${res.status}): ${body || res.statusText}`)
  }
  return res.json() as Promise<T>
}

export const listGames = async (system?: System): Promise<Game[]> => {
  const url = system ? `${base}/api/games?system=${system}` : `${base}/api/games`
  return jsonOrThrow<Game[]>(await fetch(url))
}

export const getGame = async (id: string): Promise<Game> => jsonOrThrow<Game>(await fetch(`${base}/api/games/${id}`))

export const romUrl = (id: string): string => `${base}/api/games/${id}/rom`

export const deleteGame = async (id: string): Promise<void> => {
  const res = await fetch(`${base}/api/games/${id}`, { method: "DELETE" })
  if (!res.ok && res.status !== 204) throw new Error(`delete failed: ${res.status}`)
}

export type StreamSession = {
  id: string
  system: System
  width: number
  height: number
  fps: number
  sampleRate: number
  wsPath: string
  game: { id: string; title: string; system: System }
}

export type StreamSessionError = {
  error: string
  detail?: string
  fallback?: "local"
  game?: { id: string; system: System }
}

export const createStreamSession = async (gameId: string): Promise<StreamSession | StreamSessionError> => {
  const res = await fetch(`${base}/api/stream/sessions`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ gameId }),
  })
  const parsed = await res.json().catch(() => ({}) as unknown)
  if (res.ok) return parsed as StreamSession
  return parsed as StreamSessionError
}

export const destroyStreamSession = async (id: string): Promise<void> => {
  await fetch(`${base}/api/stream/sessions/${id}`, { method: "DELETE" }).catch(() => {})
}

export type UploadProgress = {
  filename: string
  loaded: number
  total: number
  done: boolean
}

export const uploadRom = (
  file: File,
  onProgress?: (p: UploadProgress) => void,
  signal?: AbortSignal,
): Promise<GameUploadResult> =>
  new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open("POST", `${base}/api/games`, true)
    xhr.setRequestHeader("Content-Type", "application/octet-stream")
    xhr.setRequestHeader("X-Filename", encodeURIComponent(file.name))
    xhr.timeout = 0

    xhr.upload.onprogress = (e) => {
      if (!onProgress) return
      onProgress({
        filename: file.name,
        loaded: e.loaded,
        total: e.lengthComputable ? e.total : file.size,
        done: false,
      })
    }
    xhr.onload = () => {
      try {
        const parsed = JSON.parse(xhr.responseText || "{}")
        if (xhr.status >= 200 && xhr.status < 300) {
          onProgress?.({ filename: file.name, loaded: file.size, total: file.size, done: true })
          resolve({ ok: true, game: parsed.game, filename: file.name })
        } else {
          resolve({ ok: false, reason: parsed.reason ?? `http ${xhr.status}`, filename: file.name })
        }
      } catch (err) {
        reject(err)
      }
    }
    xhr.onerror = () => reject(new Error("network error"))
    xhr.onabort = () => reject(new Error("aborted"))

    if (signal) {
      if (signal.aborted) {
        xhr.abort()
        reject(new Error("aborted"))
        return
      }
      signal.addEventListener("abort", () => xhr.abort(), { once: true })
    }

    xhr.send(file)
  })
