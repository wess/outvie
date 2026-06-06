import { mkdir } from "node:fs/promises"
import { resolve } from "node:path"
import { type Connection, connect } from "@atlas/db"
import { migrate } from "@atlas/migrate"
import { createStore, paths, type Store } from "@outvie/library"
import { seedOwner } from "./auth/users.ts"
import { type Config, config } from "./config.ts"

export type AppState = {
  cfg: Config
  db: Connection
  store: Store
}

let current: AppState | null = null

// Install the shared app state. Used by init() at boot and directly by tests
// that wire their own in-memory db/store without touching Postgres.
export const setApp = (state: AppState): AppState => {
  current = state
  return current
}

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
  const state = setApp({ cfg, db, store })

  // Seed the owner account from OWNER_EMAIL/OWNER_PASSWORD when the users
  // table is empty, so a fresh deploy can log in without an external IdP.
  // No-op once any user exists.
  await seedOwner(db, { email: cfg.ownerEmail, password: cfg.ownerPassword })

  return state
}

export const app = (): AppState => {
  if (!current) throw new Error("state not initialised — call init() first")
  return current
}
