import { requireAuth, token } from "@atlas/auth"
import type { Connection } from "@atlas/db"
import { from } from "@atlas/db"
import type { Conn, PipeFn } from "@atlas/server"
import { assign, get, halt, json, pipe, pipeline } from "@atlas/server"
import { app } from "../state.ts"

// Auth payload that requireAuth attaches to conn.assigns.auth. Mirrors
// what setupOutvieSso's issueSession puts in the JWT (sub = user id,
// email/username/name copied off the SSO claims).
export type AuthClaims = {
  readonly sub: number
  readonly email: string
  readonly username: string
  readonly name: string
  readonly is_owner?: boolean
}

type AuthAssigns = { auth: AuthClaims }

export const authId = (c: Conn): number => {
  const assigns = c.assigns as AuthAssigns | undefined
  if (!assigns?.auth) throw new Error("authId called on an unauthenticated conn")
  return assigns.auth.sub
}

export const guard = (secret: string): PipeFn => requireAuth({ secret })

// Owner/admin-only guard for library management (upload, edit, delete).
// Verifies the bearer token like guard() does, then rejects anyone whose
// token isn't flagged is_owner. Mirrors romGuard's hand-rolled style so it
// can short-circuit with a 403 distinct from the 401 of a missing token.
export const ownerGuard = (secret: string): PipeFn =>
  pipe(async (c: Conn) => {
    const header = c.headers.get("authorization")
    const bearer = header?.startsWith("Bearer ") ? header.slice(7) : header
    if (!bearer) return halt(c, 401, { error: "missing authorization header" })
    let claims: AuthClaims
    try {
      claims = (await token.verify(bearer, secret)) as AuthClaims
    } catch {
      return halt(c, 401, { error: "invalid token" })
    }
    if (!claims.is_owner) return halt(c, 403, { error: "owner_required" })
    return assign(c, { auth: claims })
  })

type UserRow = {
  id: number
  email: string
  username: string
  name: string
  is_owner: boolean
}

const findUser = async (db: Connection, id: number): Promise<UserRow | null> => {
  return (await db.one(
    from("users")
      .where((b) => b("id").equals(id))
      .select("id", "email", "username", "name", "is_owner"),
  )) as UserRow | null
}

// Routes that report and revoke the active session. Mirrors stohr/tangle
// so the SPA's adoptToken() flow can immediately fetch /api/me after
// reading the SSO callback's #token=… fragment.
export const authRoutes = (secret: string) => [
  get(
    "/api/me",
    pipeline(guard(secret))(async (c) => {
      const id = authId(c)
      const u = await findUser(app().db, id)
      if (!u) return halt(c, 404, { error: "user_not_found" })
      return json(c, 200, u)
    }),
  ),
]

export const issueToken = (claims: AuthClaims, secret: string): Promise<string> =>
  token.sign({ ...claims }, secret, { expiresIn: 60 * 60 * 24 * 7 })
