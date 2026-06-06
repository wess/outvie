import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { connect } from "@atlas/db"
import { router } from "@atlas/server"
import { createStore } from "@outvie/library"
import { issueToken } from "../auth/index.ts"
import { type AppState, setApp } from "../state.ts"
import { gamesRoutes } from "./games.ts"

// End-to-end round-trip over the real games router: an owner uploads a ROM
// (streamed body -> ingest pipeline), lists it back, edits its title, then
// deletes it. Also asserts the owner-only guard rejects anonymous and
// non-owner callers. Runs against an in-memory SQLite DB and a temp data dir.

const SECRET = "test-secret"

// "NES\x1a" header + padding so sniffSystem classifies it as NES.
const NES_ROM = new Uint8Array([0x4e, 0x45, 0x53, 0x1a, ...new Array(16).fill(0)])

const bytesToStream = (bytes: Uint8Array): ReadableStream<Uint8Array> =>
  new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(bytes)
      controller.close()
    },
  })

// A streaming request body requires the non-standard `duplex` option at
// runtime; it isn't in the lib.dom RequestInit yet, so build the init as a
// plain record and hand it to Request.
const streamingInit = (init: RequestInit, body: ReadableStream<Uint8Array>): RequestInit =>
  ({ ...init, body, duplex: "half" }) as RequestInit

let dataDir = ""
let handler: (req: Request) => Promise<Response>
let ownerToken = ""
let userToken = ""

const upload = (token: string | null, filename: string, bytes: Uint8Array) =>
  handler(
    new Request(
      "http://test/api/games",
      streamingInit(
        {
          method: "POST",
          headers: {
            "x-filename": filename,
            ...(token ? { authorization: `Bearer ${token}` } : {}),
          },
        },
        bytesToStream(bytes),
      ),
    ),
  )

beforeAll(async () => {
  dataDir = await mkdtemp(join(tmpdir(), "outvie-games-"))
  const db = connect({ driver: "sqlite", path: ":memory:" })
  await db.execute({
    text: `CREATE TABLE games (
      id TEXT PRIMARY KEY, owner_id INTEGER, title TEXT NOT NULL, system TEXT NOT NULL,
      filename TEXT NOT NULL, size INTEGER NOT NULL, sha1 TEXT NOT NULL UNIQUE, added_at TEXT NOT NULL)`,
    values: [],
  })
  const store = createStore(db)
  setApp({ db, store, cfg: { dataDir, secret: SECRET } } as unknown as AppState)
  handler = router(...gamesRoutes(SECRET))
  ownerToken = await issueToken(
    { sub: 1, email: "owner@test", username: "owner", name: "Owner", is_owner: true },
    SECRET,
  )
  userToken = await issueToken({ sub: 2, email: "user@test", username: "user", name: "User", is_owner: false }, SECRET)
})

afterAll(async () => {
  if (dataDir) await rm(dataDir, { recursive: true, force: true })
})

describe("games routes round-trip", () => {
  test("rejects an unauthenticated upload with 401", async () => {
    const res = await upload(null, "Anon (USA).nes", NES_ROM)
    expect(res.status).toBe(401)
  })

  test("rejects a non-owner upload with 403", async () => {
    const res = await upload(userToken, "User (USA).nes", NES_ROM)
    expect(res.status).toBe(403)
  })

  test("owner uploads, lists, edits, and deletes a rom", async () => {
    const created = await upload(ownerToken, "Cool Game (USA).nes", NES_ROM)
    expect(created.status).toBe(201)
    const body = (await created.json()) as {
      ok: boolean
      game: { id: string; title: string; system: string }
    }
    expect(body.ok).toBe(true)
    expect(body.game.system).toBe("nes")
    const id = body.game.id

    const listRes = await handler(
      new Request("http://test/api/games", { headers: { authorization: `Bearer ${userToken}` } }),
    )
    expect(listRes.status).toBe(200)
    const list = (await listRes.json()) as Array<{ id: string }>
    expect(list.some((g) => g.id === id)).toBe(true)

    const editRes = await handler(
      new Request(`http://test/api/games/${id}`, {
        method: "PATCH",
        headers: { authorization: `Bearer ${ownerToken}`, "content-type": "application/json" },
        body: JSON.stringify({ title: "Renamed Game" }),
      }),
    )
    expect(editRes.status).toBe(200)
    const edited = (await editRes.json()) as { title: string }
    expect(edited.title).toBe("Renamed Game")

    const delRes = await handler(
      new Request(`http://test/api/games/${id}`, {
        method: "DELETE",
        headers: { authorization: `Bearer ${ownerToken}` },
      }),
    )
    expect(delRes.status).toBe(204)

    const afterRes = await handler(
      new Request("http://test/api/games", { headers: { authorization: `Bearer ${userToken}` } }),
    )
    const after = (await afterRes.json()) as Array<{ id: string }>
    expect(after.some((g) => g.id === id)).toBe(false)
  })

  test("rejects a non-owner delete with 403", async () => {
    const res = await handler(
      new Request("http://test/api/games/whatever", {
        method: "DELETE",
        headers: { authorization: `Bearer ${userToken}` },
      }),
    )
    expect(res.status).toBe(403)
  })
})
