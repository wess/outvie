import type { Route } from "@atlas/server"
import { gamesRoutes } from "./games.ts"
import { healthRoutes } from "./health.ts"
import { romRoutes } from "./rom.ts"
import { streamRoutes } from "./stream.ts"

export const buildRoutes = (): Route[] => [...healthRoutes, ...gamesRoutes, ...romRoutes, ...streamRoutes]
