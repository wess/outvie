import { mkdir } from "node:fs/promises"
import { openStore, paths, type Store } from "@outvie/library"
import { config, type Config } from "./config.ts"

export type AppState = {
  cfg: Config
  store: Store
}

let current: AppState | null = null

export const init = async (): Promise<AppState> => {
  if (current) return current
  const cfg = config()
  const p = paths(cfg.dataDir)
  await mkdir(p.roms, { recursive: true })
  await mkdir(p.saves, { recursive: true })
  await mkdir(p.states, { recursive: true })
  current = { cfg, store: openStore(cfg.databasePath) }
  return current
}

export const app = (): AppState => {
  if (!current) throw new Error("state not initialised — call init() first")
  return current
}
