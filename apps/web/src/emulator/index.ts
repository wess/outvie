import type { Game } from "@outvie/core"

export type PlayerMount = {
  canvas: HTMLCanvasElement
  game: Game
  romUrl: string
  onError?: (err: unknown) => void
}

export type Player = {
  pause: () => void
  resume: () => void
  saveState: () => Promise<Blob | null>
  loadState: (data: Blob) => Promise<void>
  dispose: () => Promise<void>
}

export type PlayerKind = "local" | "remote"

export { mountLocalPlayer } from "./local/index.ts"
export { mountRemotePlayer } from "./remote/index.ts"
