import type { Game, GameUploadResult, System } from "@outvie/core"
import { authHeaders, getToken } from "./auth.ts"

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
  return jsonOrThrow<Game[]>(await fetch(url, { headers: authHeaders() }))
}

export const getGame = async (id: string): Promise<Game> =>
  jsonOrThrow<Game>(await fetch(`${base}/api/games/${id}`, { headers: authHeaders() }))

// ROM bytes need the JWT too. Browsers can't send Authorization headers
// when fetching via `<source src="…">` or `<img src="…">`, so for those
// cases we append the token on the URL. Used by the WASM emulator's
// fetch() (header path) and by libretro's HTML <video> fallback (query
// path). Server accepts either; query token is short-lived in practice
// since it lives only in memory and the URL never persists.
export const romUrl = (id: string): string => {
  const t = getToken()
  return t
    ? `${base}/api/games/${id}/rom?token=${encodeURIComponent(t)}`
    : `${base}/api/games/${id}/rom`
}

export const deleteGame = async (id: string): Promise<void> => {
  const res = await fetch(`${base}/api/games/${id}`, {
    method: "DELETE",
    headers: authHeaders(),
  })
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
    headers: authHeaders({ "content-type": "application/json" }),
    body: JSON.stringify({ gameId }),
  })
  const parsed = await res.json().catch(() => ({}) as unknown)
  if (res.ok) return parsed as StreamSession
  return parsed as StreamSessionError
}

export const destroyStreamSession = async (id: string): Promise<void> => {
  await fetch(`${base}/api/stream/sessions/${id}`, {
    method: "DELETE",
    headers: authHeaders(),
  }).catch(() => {})
}

// ── Per-user save states ───────────────────────────────────────────

export type GameSave = {
  id: number
  game_id: string
  slot: number
  size: number
  label: string | null
  created_at: string
  updated_at: string
}

export const listSaves = async (gameId: string): Promise<GameSave[]> => {
  const res = await fetch(`${base}/api/games/${gameId}/saves`, { headers: authHeaders() })
  if (!res.ok) throw new Error(`list saves failed: ${res.status}`)
  const body = (await res.json()) as { saves: GameSave[] }
  return body.saves
}

export const uploadSave = async (
  gameId: string,
  slot: number,
  blob: Blob,
  label?: string,
): Promise<GameSave> => {
  const qs = label ? `?label=${encodeURIComponent(label)}` : ""
  const res = await fetch(`${base}/api/games/${gameId}/saves/${slot}${qs}`, {
    method: "POST",
    headers: authHeaders({ "content-type": "application/octet-stream" }),
    body: blob,
  })
  if (!res.ok) {
    const text = await res.text().catch(() => "")
    throw new Error(`save failed (${res.status}): ${text}`)
  }
  return (await res.json()) as GameSave
}

export const downloadSave = async (gameId: string, slot: number): Promise<Blob | null> => {
  const res = await fetch(`${base}/api/games/${gameId}/saves/${slot}`, { headers: authHeaders() })
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`load failed: ${res.status}`)
  return await res.blob()
}

export const deleteSave = async (gameId: string, slot: number): Promise<void> => {
  await fetch(`${base}/api/games/${gameId}/saves/${slot}`, {
    method: "DELETE",
    headers: authHeaders(),
  }).catch(() => {})
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
    const t = getToken()
    if (t) xhr.setRequestHeader("Authorization", `Bearer ${t}`)
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
