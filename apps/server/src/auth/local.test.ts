import { beforeAll, describe, expect, test } from "bun:test"
import { connect } from "@atlas/db"
import { router } from "@atlas/server"
import { type AppState, setApp } from "../state.ts"
import { localAuthRoutes } from "./local.ts"

// Local owner-account login path: a fresh install reports needsSetup, the
// first-run setup creates the owner, setup then closes, and password login
// works (and rejects a wrong password). No external IdP involved.

const SECRET = "test-secret"

let handler: (req: Request) => Promise<Response>

const postJson = (path: string, body: unknown) =>
  handler(
    new Request(`http://test${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  )

beforeAll(async () => {
  const db = connect({ driver: "sqlite", path: ":memory:" })
  await db.execute({
    text: `CREATE TABLE users (
      id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT NOT NULL UNIQUE, username TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL, password TEXT NOT NULL, is_owner INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')))`,
    values: [],
  })
  setApp({ db, cfg: { secret: SECRET }, store: {} } as unknown as AppState)
  handler = router(...localAuthRoutes(SECRET))
})

describe("local auth flow", () => {
  test("reports needsSetup on a fresh install", async () => {
    const res = await handler(new Request("http://test/api/auth/setup"))
    expect(res.status).toBe(200)
    expect((await res.json()) as { needsSetup: boolean }).toEqual({ needsSetup: true })
  })

  test("first-run setup creates the owner and returns a session", async () => {
    const res = await postJson("/api/auth/setup", { email: "owner@test", password: "password123" })
    expect(res.status).toBe(201)
    const body = (await res.json()) as { token: string; user: { is_owner: boolean } }
    expect(typeof body.token).toBe("string")
    expect(body.user.is_owner).toBeTruthy()
  })

  test("setup is closed once an owner exists", async () => {
    const res = await postJson("/api/auth/setup", { email: "second@test", password: "password123" })
    expect(res.status).toBe(409)
  })

  test("login succeeds with the right password", async () => {
    const res = await postJson("/api/auth/login", { login: "owner@test", password: "password123" })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { token: string }
    expect(typeof body.token).toBe("string")
  })

  test("login rejects a wrong password with 401", async () => {
    const res = await postJson("/api/auth/login", { login: "owner@test", password: "wrong" })
    expect(res.status).toBe(401)
  })
})
