import { hash } from "@atlas/auth"
import type { Connection } from "@atlas/db"
import { from } from "@atlas/db"

// Shared user-row queries used by both the local password flow and the
// boot-time owner seed. Kept separate from the route handlers so the
// SSO path and the local path can reuse the same lookups.

export type UserRow = {
  id: number
  email: string
  username: string
  name: string
  is_owner: boolean
}

type UserWithPassword = UserRow & { password: string }

const slugifyUsername = (raw: string): string =>
  raw
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 39) || "user"

// Look up a user by email OR username so the login form can accept either.
export const findByLogin = async (db: Connection, login: string): Promise<UserWithPassword | null> => {
  const value = login.trim().toLowerCase()
  if (!value) return null
  const byEmail = (await db.one(
    from("users")
      .where((b) => b("email").equals(value))
      .select("id", "email", "username", "name", "is_owner", "password"),
  )) as UserWithPassword | null
  if (byEmail) return byEmail
  return (await db.one(
    from("users")
      .where((b) => b("username").equals(value))
      .select("id", "email", "username", "name", "is_owner", "password"),
  )) as UserWithPassword | null
}

export const countUsers = async (db: Connection): Promise<number> => {
  const row = (await db.one({ text: "SELECT COUNT(*) AS n FROM users", values: [] })) as {
    n: number | bigint
  } | null
  return row ? Number(row.n) : 0
}

export type CreateUserInput = {
  email: string
  password: string
  name?: string
  username?: string
  isOwner?: boolean
}

// Create a user with a hashed password. Returns the public row (no hash).
export const createUser = async (db: Connection, input: CreateUserInput): Promise<UserRow> => {
  const email = input.email.trim().toLowerCase()
  if (!email) throw new Error("email required")
  const username = slugifyUsername(input.username ?? email.split("@")[0] ?? "user")
  const name = input.name?.trim() || username
  const password = await hash(input.password)
  const inserted = (await db.execute(
    from("users")
      .insert({ email, username, name, password, is_owner: input.isOwner ?? false })
      .returning("id", "email", "username", "name", "is_owner"),
  )) as UserRow[]
  const row = inserted[0]
  if (!row) throw new Error("user insert failed")
  return row
}

// Boot-time seed. When OWNER_EMAIL + OWNER_PASSWORD are supplied and the
// users table is empty, create the owner so a fresh deploy is immediately
// usable without SSO. No-op once any user exists.
export const seedOwner = async (db: Connection, owner: { email: string; password: string }): Promise<void> => {
  if (!owner.email || !owner.password) return
  if ((await countUsers(db)) > 0) return
  await createUser(db, {
    email: owner.email,
    password: owner.password,
    isOwner: true,
  })
}
