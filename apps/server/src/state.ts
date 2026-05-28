import { mkdir } from "node:fs/promises"
import { resolve } from "node:path"
import { connect, type Connection } from "@atlas/db"
import { migrate } from "@atlas/migrate"
import { createStore, paths, type Store } from "@outvie/library"
import { config, type Config } from "./config.ts"

export type AppState = {
  cfg: Config
  db: Connection
  store: Store
}

let current: AppState | null = null

export const init = async (): Promise<AppState> => {
  if (current) return current
  const cfg = config()

  // Ensure ROM/save directories exist on the data volume.
  const p = paths(cfg.dataDir)
  await mkdir(p.roms, { recursive: true })
  await mkdir(p.saves, { recursive: true })
  await mkdir(p.states, { recursive: true })

  // Connect Postgres and run pending migrations. Migrations are tracked
  // by @atlas/migrate in a `schema_migrations` table.
  const db = connect({ driver: "postgres", url: cfg.databaseUrl })
  await migrate.up(db, resolve(import.meta.dir, "../../..", "migrations"))

  const store = createStore(db)
  current = { cfg, db, store }
  return current
}

export const app = (): AppState => {
  if (!current) throw new Error("state not initialised — call init() first")
  return current
}
