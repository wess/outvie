import type { Connection } from "@atlas/db"
import { from, raw } from "@atlas/db"
import type { Game, System } from "@outvie/core"

// Editable metadata fields for an existing game. Only title and system are
// user-mutable; id/sha1/filename/size are derived from the ingested ROM.
export type GamePatch = {
  title?: string
  system?: System
}

export type Store = {
  list: (opts?: { system?: System; ownerId?: number }) => Promise<Game[]>
  get: (id: string) => Promise<Game | null>
  getBySha1: (sha1: string) => Promise<Game | null>
  insert: (game: Game, ownerId?: number | null) => Promise<void>
  update: (id: string, patch: GamePatch) => Promise<Game | null>
  remove: (id: string) => Promise<void>
}

type Row = {
  id: string
  title: string
  system: string
  filename: string
  size: number | bigint
  sha1: string
  added_at: string | Date
  owner_id: number | null
}

const toGame = (r: Row): Game => ({
  id: r.id,
  title: r.title,
  system: r.system as System,
  filename: r.filename,
  size: typeof r.size === "bigint" ? Number(r.size) : r.size,
  sha1: r.sha1,
  addedAt: typeof r.added_at === "string" ? r.added_at : r.added_at.toISOString(),
})

export const createStore = (db: Connection): Store => {
  return {
    list: async (opts) => {
      let q = from("games")
      if (opts?.system) q = q.where((b) => b("system").equals(opts.system!))
      if (opts?.ownerId !== undefined) {
        q = q.where((b) => b("owner_id").equals(opts.ownerId as number))
      }
      const rows = (await db.all(q.orderBy(raw("LOWER(title)"), "ASC"))) as Row[]
      return rows.map(toGame)
    },
    get: async (id) => {
      const row = (await db.one(from("games").where((b) => b("id").equals(id)))) as Row | null
      return row ? toGame(row) : null
    },
    getBySha1: async (sha1) => {
      const row = (await db.one(from("games").where((b) => b("sha1").equals(sha1)))) as Row | null
      return row ? toGame(row) : null
    },
    insert: async (g, ownerId = null) => {
      await db.execute(
        from("games").insert({
          id: g.id,
          owner_id: ownerId,
          title: g.title,
          system: g.system,
          filename: g.filename,
          size: g.size,
          sha1: g.sha1,
          added_at: g.addedAt,
        }),
      )
    },
    update: async (id, patch) => {
      const changes: Record<string, string> = {}
      if (patch.title !== undefined) changes.title = patch.title
      if (patch.system !== undefined) changes.system = patch.system
      if (Object.keys(changes).length > 0) {
        await db.execute(
          from("games")
            .where((b) => b("id").equals(id))
            .update(changes),
        )
      }
      const row = (await db.one(from("games").where((b) => b("id").equals(id)))) as Row | null
      return row ? toGame(row) : null
    },
    remove: async (id) => {
      await db.execute(
        from("games")
          .where((b) => b("id").equals(id))
          .del(),
      )
    },
  }
}
