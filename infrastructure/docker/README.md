# Docker (local development)

- `postgres/init/` — SQL run once by the PostGIS image when the `postgres-data` volume is
  empty. It only enables extensions; schema changes go in migrations
  (see `docs/architecture/decisions.md`).
- The Compose file lives at the repository root (`docker-compose.yml`) so `docker compose`
  works from the root without `-f`.
- Production images and Compose files will be added under `infrastructure/docker/production/`
  when deployment work starts. Do not reuse the development file in production.
