import type { System } from "../system/index.ts"

export type Game = {
  id: string
  title: string
  system: System
  filename: string
  size: number
  sha1: string
  addedAt: string
}

export type GameSummary = Omit<Game, "sha1">

export type GameUploadResult = {
  ok: boolean
  game?: Game
  reason?: string
  filename: string
}
