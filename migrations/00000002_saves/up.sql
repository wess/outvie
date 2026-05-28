-- Per-user save states. One row per (user, game, slot). slot=0 is the
-- default quick-save; future slots (1-9, named) are easy to add later.
-- The blob lives on disk at DATA_DIR/saves/<user_id>/<game_id>-<slot>.state
-- so postgres only stores metadata.
CREATE TABLE game_saves (
  id          SERIAL PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  game_id     TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  slot        INTEGER NOT NULL DEFAULT 0,
  size        BIGINT NOT NULL,
  label       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, game_id, slot)
);
CREATE INDEX idx_game_saves_user_game ON game_saves(user_id, game_id);
