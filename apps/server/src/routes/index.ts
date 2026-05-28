import type { Route } from "@atlas/server"
import { authRoutes } from "../auth/index.ts"
import { setupOutvieSso } from "../sso/index.ts"
import { app } from "../state.ts"
import { gamesRoutes } from "./games.ts"
import { healthRoutes } from "./health.ts"
import { romRoutes } from "./rom.ts"
import { savesRoutes } from "./saves.ts"
import { streamRoutes } from "./stream.ts"

export const buildRoutes = async (): Promise<Route[]> => {
  const { cfg, db } = app()

  // Mount SSO only when all three env vars are supplied — otherwise the
  // app boots without SSO and falls back to "you must hit it locally"
  // for dev. In production all three are wired by compose.
  const ssoRoutes =
    cfg.ssoIssuer && cfg.ssoClientId && cfg.ssoClientSecret
      ? await setupOutvieSso(db, {
          issuerUrl: cfg.ssoIssuer,
          clientId: cfg.ssoClientId,
          clientSecret: cfg.ssoClientSecret,
          secret: cfg.secret,
        })
      : []

  return [
    ...healthRoutes,
    ...authRoutes(cfg.secret),
    ...ssoRoutes,
    // Saves routes are registered BEFORE gamesRoutes because gamesRoutes
    // owns `/api/games/:id` (which would otherwise gobble `/api/games/:id/saves`).
    ...savesRoutes(cfg.secret),
    ...gamesRoutes(cfg.secret),
    ...romRoutes(cfg.secret),
    ...streamRoutes(cfg.secret),
  ]
}
