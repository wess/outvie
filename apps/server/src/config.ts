import { env } from "@atlas/config"

const port = env("PORT", { default: "4290", parse: Number })
const host = env("HOST", { default: "0.0.0.0" })
const webOrigin = env("WEB_ORIGIN", { default: "http://localhost:5174" })
const dataDir = env("DATA_DIR", { default: "./data" })
const databasePath = env("DATABASE_PATH", { default: "./outvie.db" })
const webRoot = env("WEB_ROOT", { default: "" })
const engineUrl = env("ENGINE_URL", { default: "http://127.0.0.1:4291" })

export const config = () => ({
  port: port.read(),
  host: host.read(),
  webOrigin: webOrigin.read(),
  dataDir: dataDir.read(),
  databasePath: databasePath.read(),
  webRoot: webRoot.read(),
  engineUrl: engineUrl.read(),
})

export type Config = ReturnType<typeof config>
