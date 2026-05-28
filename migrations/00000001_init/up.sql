-- Outvie schema (Postgres).
--
-- users: SSO-only — castle is the IdP. password column is NOT NULL but
-- carries a sentinel hash so direct password login can't succeed. New
-- users are JIT-created on first SSO callback (see src/sso/index.ts).
CREATE TABLE users (
  id          SERIAL PRIMARY KEY,
  email       TEXT NOT NULL UNIQUE,
  username    TEXT NOT NULL UNIQUE,
  name        TEXT NOT NULL,
  password    TEXT NOT NULL,
  is_owner    BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- games: the ROM library. Files on disk live at
-- DATA_DIR/roms/<system>/<id><ext>. owner_id is the user who uploaded it;
-- a NULL owner means "system" (legacy/imported). Listing is scoped by
-- owner_id at the route layer.
CREATE TABLE games (
  id          TEXT PRIMARY KEY,
  owner_id    INTEGER REFERENCES users(id) ON DELETE SET NULL,
  title       TEXT NOT NULL,
  system      TEXT NOT NULL,
  filename    TEXT NOT NULL,
  size        BIGINT NOT NULL,
  sha1        TEXT NOT NULL UNIQUE,
  added_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_games_system ON games(system);
CREATE INDEX idx_games_title  ON games(title);
CREATE INDEX idx_games_owner  ON games(owner_id);

-- sso_state: transient PKCE/state rows for the relying-party
-- /login → /callback hand-off. Created by @atlas/sso's
-- ensureSsoStateTable on boot; included here so a fresh deploy with
-- migrate.up gets it without a separate code path.
CREATE TABLE sso_state (
  state       TEXT PRIMARY KEY,
  verifier    TEXT NOT NULL,
  nonce       TEXT NOT NULL,
  return_to   TEXT NOT NULL DEFAULT '/',
  expires_at  TIMESTAMPTZ NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
