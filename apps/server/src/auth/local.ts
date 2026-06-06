import { verify } from "@atlas/auth"
import { get, halt, json, pipe, post } from "@atlas/server"
import { app } from "../state.ts"
import { issueToken } from "./index.ts"
import { countUsers, createUser, findByLogin } from "./users.ts"

// Local password login. This is the default sign-in path for a fresh
// install — no external IdP required. SSO (when configured) stays as an
// optional alternative mounted alongside these routes.

type LoginBody = { login?: string; email?: string; username?: string; password?: string }
type SetupBody = { email?: string; password?: string; name?: string; username?: string }

const readJson = async <T>(req: Request): Promise<T> => (await req.json().catch(() => ({}))) as T

const sessionFor = async (
  user: { id: number; email: string; username: string; name: string; is_owner: boolean },
  secret: string,
) => {
  const t = await issueToken(
    {
      sub: user.id,
      email: user.email,
      username: user.username,
      name: user.name,
      is_owner: user.is_owner,
    },
    secret,
  )
  return { token: t, user }
}

export const localAuthRoutes = (secret: string) => [
  // First-run probe. The SPA hits this on the login screen to decide
  // whether to show the "create owner account" form or the login form.
  get(
    "/api/auth/setup",
    pipe(async (c) => {
      const needsSetup = (await countUsers(app().db)) === 0
      return json(c, 200, { needsSetup })
    }),
  ),

  // First-run setup. Only succeeds while the users table is empty; the
  // account it creates is the owner. Once any user exists this is closed
  // so it can't be used to create extra accounts.
  post(
    "/api/auth/setup",
    pipe(async (c) => {
      const body = await readJson<SetupBody>(c.request)
      const email = body.email?.trim()
      const password = body.password ?? ""
      if (!email || !password) return halt(c, 400, { error: "email_and_password_required" })
      if (password.length < 8) return halt(c, 400, { error: "password_too_short" })
      if ((await countUsers(app().db)) > 0) return halt(c, 409, { error: "already_setup" })

      const user = await createUser(app().db, {
        email,
        password,
        name: body.name,
        username: body.username,
        isOwner: true,
      })
      return json(c, 201, await sessionFor(user, secret))
    }),
  ),

  // Password login. Accepts `login` (email or username) or the explicit
  // `email`/`username` fields, plus `password`.
  post(
    "/api/auth/login",
    pipe(async (c) => {
      const body = await readJson<LoginBody>(c.request)
      const login = body.login ?? body.email ?? body.username ?? ""
      const password = body.password ?? ""
      if (!login || !password) return halt(c, 400, { error: "login_and_password_required" })

      const row = await findByLogin(app().db, login)
      if (!row || !(await verify(password, row.password))) {
        return halt(c, 401, { error: "invalid_credentials" })
      }
      return json(c, 200, await sessionFor(row, secret))
    }),
  ),
]
