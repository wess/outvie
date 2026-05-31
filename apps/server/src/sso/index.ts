// SSO relying-party wiring. Mounts @atlas/sso when SSO_ISSUER is set.
// JIT-creates the local users row on first login; subsequent logins
// upsert by email/username. Castle is the IdP.

import { hash } from "@atlas/auth"
import type { Connection } from "@atlas/db"
import { from } from "@atlas/db"
import type { Conn } from "@atlas/server"
import { ensureSsoStateTable, type IdTokenClaims, mountSso, type SsoConfig } from "@atlas/sso"
import { issueToken } from "../auth/index.ts"

type SyncedUser = {
  id: number
  username: string
  name: string
  email: string
  is_owner: boolean
}

const slugifyUsername = (raw: string): string =>
  raw
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 39) || "user"

const claimUsername = (claims: IdTokenClaims): string => {
  const raw = claims.preferred_username ?? (claims.email ? claims.email.split("@")[0] : null)
  if (!raw) throw new Error("ID token lacks preferred_username and email")
  return slugifyUsername(String(raw))
}

const claimEmail = (claims: IdTokenClaims): string => {
  if (!claims.email) throw new Error("ID token lacks email claim")
  return String(claims.email).toLowerCase()
}

const placeholderHash = (): Promise<string> => hash(`outvie-sso-placeholder-${Math.random().toString(36)}`)

const upsertUser = async (db: Connection, claims: IdTokenClaims): Promise<SyncedUser> => {
  const email = claimEmail(claims)
  const username = claimUsername(claims)
  const name = (claims.name as string | undefined)?.trim() || username

  const byEmail = (await db.one(
    from("users")
      .where((q) => q("email").equals(email))
      .select("id", "is_owner"),
  )) as { id: number; is_owner: boolean } | null
  const target =
    byEmail ??
    ((await db.one(
      from("users")
        .where((q) => q("username").equals(username))
        .select("id", "is_owner"),
    )) as { id: number; is_owner: boolean } | null)

  if (target) {
    await db.execute(
      from("users")
        .where((q) => q("id").equals(target.id))
        .update({ email, username, name, updated_at: new Date() }),
    )
    return { id: target.id, username, name, email, is_owner: target.is_owner }
  }

  // First user to sign in becomes owner. Single-tenant homelab; the
  // "owner" badge gates admin features (none for now, future-proofed).
  const existing = (await db.one(from("users").select("id"))) as { id: number } | null
  const isOwner = !existing

  const password = await placeholderHash()
  const inserted = (await db.execute(
    from("users").insert({ email, username, name, password, is_owner: isOwner }).returning("id", "is_owner"),
  )) as Array<{ id: number; is_owner: boolean }>
  const row = inserted[0]
  if (!row) throw new Error("user insert failed")
  return { id: row.id, username, name, email, is_owner: row.is_owner }
}

export type SsoEnv = {
  issuerUrl: string
  clientId: string
  clientSecret: string
  secret: string
}

export const setupOutvieSso = async (db: Connection, env: SsoEnv) => {
  await ensureSsoStateTable(db)

  const cfg: SsoConfig = {
    db,
    issuerUrl: env.issuerUrl,
    clientId: env.clientId,
    clientSecret: env.clientSecret,
    onAuthenticated: async (db, claims) => {
      const user = await upsertUser(db, claims)
      return { localUserId: user.id, displayName: user.name }
    },
    issueSession: async (conn: Conn, _user, claims) => {
      const user = await upsertUser(db, claims)
      const t = await issueToken(
        {
          sub: user.id,
          email: user.email,
          username: user.username,
          name: user.name,
          is_owner: user.is_owner,
        },
        env.secret,
      )
      // Hand the token back on the URL fragment so the SPA can pick it
      // up the same way tangle/stohr do — no cookies, no server-side
      // session, the JWT IS the session.
      const target = new URL(conn.request.url)
      target.pathname = "/"
      target.hash = `token=${encodeURIComponent(t)}`
      target.search = ""
      const headers = new Headers(conn.respHeaders)
      headers.set("location", target.toString())
      return { ...conn, status: 302, halted: true, respHeaders: headers }
    },
    findLocalUserBySub: async (db, sub) => {
      const id = Number(sub)
      if (!Number.isFinite(id)) return null
      const row = (await db.one(
        from("users")
          .where((q) => q("id").equals(id))
          .select("id"),
      )) as { id: number } | null
      return row?.id ?? null
    },
  }
  return mountSso(cfg)
}
