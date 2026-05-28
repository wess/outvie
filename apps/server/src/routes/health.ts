import { get, json, pipe } from "@atlas/server"

export const healthRoutes = [
  get(
    "/api/health",
    pipe(async (c) => json(c, 200, { ok: true })),
  ),
]
