// JWT lives in localStorage and is sent as Bearer on every API call.
// On boot, the App component checks window.location.hash — the SSO
// callback redirects to /#token=<jwt>, which we adopt by calling
// adoptToken(t).

const TOKEN_KEY = "outvie.token"
const USER_KEY = "outvie.user"

export type AuthUser = {
  id: number
  email: string
  username: string
  name: string
  is_owner: boolean
}

let cachedToken: string | null = (() => {
  try {
    return localStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
})()

let cachedUser: AuthUser | null = (() => {
  try {
    const raw = localStorage.getItem(USER_KEY)
    return raw ? (JSON.parse(raw) as AuthUser) : null
  } catch {
    return null
  }
})()

export const getToken = (): string | null => cachedToken
export const getUser = (): AuthUser | null => cachedUser

export const setSession = (token: string | null, user: AuthUser | null): void => {
  cachedToken = token
  cachedUser = user
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token)
    else localStorage.removeItem(TOKEN_KEY)
    if (user) localStorage.setItem(USER_KEY, JSON.stringify(user))
    else localStorage.removeItem(USER_KEY)
  } catch {
    // ignore
  }
}

export const authHeaders = (extra: Record<string, string> = {}): Record<string, string> => {
  const h: Record<string, string> = { ...extra }
  if (cachedToken) h.authorization = `Bearer ${cachedToken}`
  return h
}

// Adopt a JWT off the SSO callback URL fragment. Stores the token,
// fetches /api/me to populate the user record. Returns the AuthUser
// on success or null if /me rejected (revoked / expired).
export const adoptToken = async (t: string): Promise<AuthUser | null> => {
  setSession(t, null)
  try {
    const res = await fetch("/api/me", { headers: authHeaders() })
    if (!res.ok) throw new Error(`/api/me → ${res.status}`)
    const u = (await res.json()) as AuthUser
    setSession(t, u)
    return u
  } catch {
    setSession(null, null)
    return null
  }
}

export const signOut = (): void => setSession(null, null)

// Hand the browser to the SSO start endpoint. The relying-party route
// (`@atlas/sso` mountSso) 302s to castle, which auto-approves and
// redirects back to /auth/sso/callback?code=… → /#token=<jwt>.
export const ssoLogin = (returnTo?: string): void => {
  const url = new URL("/auth/sso/login", window.location.origin)
  if (returnTo) url.searchParams.set("return_to", returnTo)
  window.location.assign(url.toString())
}

type Session = { token: string; user: AuthUser }

// First-run probe. Tells the login screen whether to offer "create owner
// account" (fresh install) or the password login form.
export const needsSetup = async (): Promise<boolean> => {
  try {
    const res = await fetch("/api/auth/setup")
    if (!res.ok) return false
    const body = (await res.json()) as { needsSetup: boolean }
    return Boolean(body.needsSetup)
  } catch {
    return false
  }
}

const startSession = async (path: string, body: unknown): Promise<AuthUser> => {
  const res = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string }
    throw new Error(err.error ?? "request_failed")
  }
  const { token, user } = (await res.json()) as Session
  setSession(token, user)
  return user
}

// Local owner-account login (no external IdP). `login` accepts email or
// username.
export const passwordLogin = (login: string, password: string): Promise<AuthUser> =>
  startSession("/api/auth/login", { login, password })

// First-run owner creation. Only succeeds while the users table is empty.
// Identified by username; email is optional on a private network.
export const setupOwner = (username: string, password: string, name?: string): Promise<AuthUser> =>
  startSession("/api/auth/setup", { username, password, name })
