# Deploy

Outvie ships in two flavours: standalone `docker compose` (anyone with Docker and a domain) and the vegeta-on-castle homelab pattern (uses [castle](https://github.com/wess/castle) to provision routing, mDNS, OAuth clients, and a shared Postgres).

## Standalone

The default `docker-compose.yml` in the repo runs outvie with its own Postgres. Sufficient for "I just want to play my games."

```sh
cp env.example .env
# Set SECRET to something long and random:
SECRET=$(openssl rand -hex 32) sed -i.bak "s/^SECRET=.*/SECRET=$SECRET/" .env && rm .env.bak

docker compose up -d
open http://localhost:4290
```

The first SSO sign-in (or, with SSO unset, the first direct API call from a JWT-equipped client) creates the user record and promotes them to owner. Without SSO env vars the relying-party routes don't mount, and outvie won't accept any session creation path on its own — pair it with an OIDC issuer for the full experience.

## Homelab on castle (vegeta stack)

This is how the upstream maintainer runs it. The shared stack at `/opt/services/compose.yaml` runs castle (systemd), one Postgres for everyone, then tangle / stohr / outvie containers, all behind a single nginx fronted by castled's mDNS+route automation.

### Prerequisites

- A castle deploy on the box (see [castle/README](https://github.com/wess/castle))
- The vegeta compose stack in `/opt/services` with Postgres up and healthy
- DNS / mDNS for `vegeta.local` resolving to the box's LAN IP

### Steps

```sh
# 1. Clone the repo into the stack
cd /opt/services
sudo git clone https://github.com/wess/outvie.git

# 2. Mint a Postgres role + database
sudo docker exec -i vegeta-postgres-1 psql -U postgres <<'EOF'
CREATE ROLE outvie LOGIN PASSWORD 'CHANGE_ME';
CREATE DATABASE outvie OWNER outvie;
EOF

# 3. Mint an OAuth client in castle (replace IDs with your own).
#    Use bun to mint a real client_secret + sha256 hash:
sudo docker exec -i vegeta-postgres-1 psql -U castle -d castle <<'EOF'
INSERT INTO oauth_clients (client_id, client_secret_hash, name, redirect_uris, allowed_scopes, is_official, created_at)
VALUES (
  'cli_<random hex>',
  '<sha256 of cs_<random>>',
  'Outvie',
  '["http://outvie.local/auth/sso/callback"]',
  '["openid","email","profile"]',
  true, NOW()
);
EOF

# 4. Append outvie env to the shared services .env:
sudo tee -a /opt/services/.env <<EOF
OUTVIE_DB_PASSWORD=…
OUTVIE_SECRET=…
OUTVIE_SSO_CLIENT_ID=cli_…
OUTVIE_SSO_CLIENT_SECRET=cs_…
EOF

# 5. Add the outvie service to /opt/services/compose.yaml (see repo for the canonical block).

# 6. Register the nginx route via castle's API (auto-writes
#    /etc/castle/nginx-routes/outvie.local.conf, reloads nginx,
#    and appends mDNS):
TOKEN=$(curl -sS -X POST http://vegeta.local/api/auth/login \
  -H 'content-type: application/json' \
  -d '{"email":"…","password":"…"}' | jq -r .token)
curl -sS -X POST http://vegeta.local/api/routes \
  -H "authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' \
  -d '{"hostname":"outvie.local","backend":"127.0.0.1:4290","websocket":true,"locations":[]}'

# 7. Build + start
sudo docker compose -f /opt/services/compose.yaml build outvie
sudo docker compose -f /opt/services/compose.yaml up -d outvie

# 8. Sanity check
curl -sS -H 'Host: outvie.local' http://vegeta.local/api/health
# {"status":"ok"}
```

Repeat step 6 with another hostname to add aliases (e.g. `arcade.local`). Update the OAuth client's `redirect_uris` to include the new callback so SSO works from whichever URL the user hit:

```sql
UPDATE oauth_clients
SET redirect_uris = '["http://outvie.local/auth/sso/callback","http://arcade.local/auth/sso/callback"]'
WHERE client_id = 'cli_…';
```

### Server-side streaming (optional)

The Rust engine is in the image and starts automatically, but it has no libretro cores to load. Drop SNES/Genesis cores into the volume and outvie's stream-mode play will work:

```sh
# In the running container (or via a custom Dockerfile layer)
apt-get install -y libretro-snes9x libretro-genesis-plus-gx
# or download .so files into /usr/lib/libretro/
```

Without cores, stream-mode requests get a clean 4xx and the SPA falls back to local WASM mode automatically — the user doesn't see an error.

### Bumping versions

The repo follows version-bump-per-change: every push to `main` lands with a `package.json` patch bump. On the server:

```sh
cd /opt/services/outvie && sudo git pull origin main
cd /opt/services && sudo docker compose build outvie && sudo docker compose up -d outvie
```

If you publish to a registry, the same `package.json`-driven publish workflow that stohr and tangle use will work — wire it the same way (see `.github/workflows/publish.yml` in those repos).

## Backups

What needs backing up:

- **`vegeta_outvie-data` volume** — ROMs and save states. Tarball it:
  ```sh
  sudo tar -C /var/lib/docker/volumes/vegeta_outvie-data/_data -czf outvie-data.tgz .
  ```
- **`outvie` Postgres database** — game metadata + users + save state metadata:
  ```sh
  sudo docker exec vegeta-postgres-1 pg_dump -U outvie outvie | gzip > outvie-db.sql.gz
  ```

Restoring is `tar -xzf` and `pg_restore` to a clean volume / database, then `docker compose up -d outvie` to run migrations.

## Bulk-import ROMs from another host

```sh
# Stage on the box
rsync -ahz -e ssh ~/roms/ user@vegeta:~/outvie-import/
sudo mv ~/outvie-import/* /var/lib/docker/volumes/vegeta_outvie-data/_data/import/

# Seed inside the container (script not in the runtime image — copy it in)
sudo docker cp /opt/services/outvie/scripts/seed.ts vegeta-outvie-1:/app/scripts/seed.ts
sudo docker exec -w /app \
  -e OWNER_ID=1 \
  -e DATA_DIR=/data \
  -e DATABASE_URL=postgres://outvie:…@postgres:5432/outvie \
  vegeta-outvie-1 \
  bun scripts/seed.ts /data/import

# Cleanup
sudo docker exec vegeta-outvie-1 rm -rf /data/import
```

The seed walks the source, sha1-dedupes against existing rows, sniffs the system from header bytes, and moves each file into `/data/roms/<system>/<id><ext>`. `OWNER_ID=1` stamps the uploader as user 1 (the first SSO user — change as needed).

If you're migrating titles from an older SQLite-based outvie, you can backfill nicer game names by sha1 match — see the README for the recipe.
