import { Database } from "bun:sqlite"
import type { Game, System } from "@outvie/core"

export type Store = {
  list: (system?: System) => Game[]
  get: (id: string) => Game | null
  getBySha1: (sha1: string) => Game | null
  insert: (game: Game) => void
  remove: (id: string) => void
  close: () => void
}

type Row = {
  id: string
  title: string
  system: string
  filename: string
  size: number
  sha1: string
  added_at: string
}

const toGame = (r: Row): Game => ({
  id: r.id,
  title: r.title,
  system: r.system as System,
  filename: r.filename,
  size: r.size,
  sha1: r.sha1,
  addedAt: r.added_at,
})

const ddl = `
  create table if not exists games (
    id text primary key,
    title text not null,
    system text not null,
    filename text not null,
    size integer not null,
    sha1 text not null unique,
    added_at text not null default (datetime('now'))
  );
  create index if not exists idx_games_system on games(system);
  create index if not exists idx_games_title on games(title);
`

export const openStore = (path: string): Store => {
  const db = new Database(path)
  db.exec("pragma journal_mode = WAL")
  db.exec(ddl)

  const selectAll = db.query<Row, []>("select * from games order by title collate nocase asc")
  const selectBySystem = db.query<Row, [string]>(
    "select * from games where system = ? order by title collate nocase asc",
  )
  const selectById = db.query<Row, [string]>("select * from games where id = ?")
  const selectBySha = db.query<Row, [string]>("select * from games where sha1 = ?")
  const insertStmt = db.query<unknown, [string, string, string, string, number, string, string]>(
    "insert into games (id, title, system, filename, size, sha1, added_at) values (?, ?, ?, ?, ?, ?, ?)",
  )
  const deleteStmt = db.query<unknown, [string]>("delete from games where id = ?")

  return {
    list: (system) => (system ? selectBySystem.all(system) : selectAll.all()).map(toGame),
    get: (id) => {
      const row = selectById.get(id)
      return row ? toGame(row) : null
    },
    getBySha1: (sha1) => {
      const row = selectBySha.get(sha1)
      return row ? toGame(row) : null
    },
    insert: (g) => {
      insertStmt.run(g.id, g.title, g.system, g.filename, g.size, g.sha1, g.addedAt)
    },
    remove: (id) => {
      deleteStmt.run(id)
    },
    close: () => db.close(),
  }
}
