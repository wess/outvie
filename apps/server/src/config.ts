import { defineConfig, env } from "@atlas/config"

export const config = () =>
  defineConfig({
    port: env("PORT", { default: "4290", parse: Number }),
    host: env("HOST", { default: "0.0.0.0" }),
    webOrigin: env("WEB_ORIGIN", { default: "http://localhost:5174" }),
    dataDir: env("DATA_DIR", { default: "./data" }),
    databaseUrl: env("DATABASE_URL", {
      default: "postgres://postgres:postgres@127.0.0.1:5432/outvie",
    }),
    webRoot: env("WEB_ROOT", { default: "" }),
    engineUrl: env("ENGINE_URL", { default: "http://127.0.0.1:4291" }),
    secret: env("SECRET", { default: "dev-secret-change-me" }),
    ssoIssuer: env("SSO_ISSUER", { default: "" }),
    ssoClientId: env("SSO_CLIENT_ID", { default: "" }),
    ssoClientSecret: env("SSO_CLIENT_SECRET", { default: "" }),
    appUrl: env("APP_URL", { default: "http://outvie.local" }),
  })

export type Config = ReturnType<typeof config>
