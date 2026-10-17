# Docker (local development)

- `postgres/init/` — SQL run once by the PostGIS image when the `postgres-data` volume is
  empty. It only enables extensions; schema changes go in migrations
  (see `docs/architecture/decisions.md`).
- The Compose file lives at the repository root (`docker-compose.yml`) so `docker compose`
  works from the root without `-f`.
- `production/` holds the reference production images (`api.Dockerfile`, `web.Dockerfile`),
  a single-VPS `compose.yml` with Caddy, the `Caddyfile` and an `env.example` for server-side
  env files. See `docs/deployment/vps-preparation.md`. Never reuse the development Compose file
  in production.
