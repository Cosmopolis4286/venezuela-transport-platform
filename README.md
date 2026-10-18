# Venezuela Transport Platform (VTP)

Engineering foundation for a Venezuelan ground-transportation platform connecting passengers,
bus companies, terminals, taxi drivers and transport operators.

> **Status: foundation only.** The repository contains working scaffolding, tooling, local
> infrastructure and CI. No business features exist yet: there is **no authentication,
> booking, payment or dispatch logic**. Do not deploy it with real users or data.

## Architecture at a glance

One Git repository (pnpm workspace + Turborepo) with **separate applications** inside it:

| Path                                                   | What                                                    | Stack                                          | Dev URL / port                  |
| ------------------------------------------------------ | ------------------------------------------------------- | ---------------------------------------------- | ------------------------------- |
| `apps/web`                                             | Public website, bus search, operator portal (`/portal`) | Next.js 16 (App Router), Tailwind 4, shadcn/ui | http://localhost:3000           |
| `apps/passenger-mobile`                                | Passenger app                                           | Expo SDK 58, Expo Router                       | Metro on :8081                  |
| `apps/transport-mobile`                                | Drivers, transport companies, terminal operators        | Expo SDK 58, Expo Router                       | Metro on :8082                  |
| `apps/api`                                             | Shared REST API — modular monolith                      | NestJS 12, OpenAPI/Swagger                     | http://localhost:4000/api/v1    |
| `packages/shared-types`                                | Framework-independent API contracts                     | TypeScript                                     | —                               |
| `packages/mobile-core`                                 | Session, API client and sign-in screens for both apps   | React Native (TypeScript source)               | —                               |
| `packages/eslint-config`, `packages/typescript-config` | Shared lint / compiler presets                          | —                                              | —                               |
| `docker-compose.yml`                                   | PostgreSQL 18 + PostGIS 3.6, optional Redis 8.10        | Docker Compose                                 | 127.0.0.1:5432 / 127.0.0.1:6379 |

Swagger UI: http://localhost:4000/api/docs · OpenAPI JSON: http://localhost:4000/api/docs-json

More detail: [architecture overview](docs/architecture/overview.md) ·
[decisions & trade-offs](docs/architecture/decisions.md).

## Prerequisites

| Tool                | Version                                                           | Notes                                                          |
| ------------------- | ----------------------------------------------------------------- | -------------------------------------------------------------- |
| Node.js             | 24 LTS (`>=24.15 <25`)                                            | `.nvmrc` provided — `nvm use` / `fnm use`                      |
| pnpm                | 10.34.7                                                           | `corepack enable` picks the pinned version automatically       |
| Docker + Compose v2 | Docker 24+ / Compose 2.20+                                        | Only for the database. Not needed for Expo.                    |
| Git                 | 2.40+                                                             |                                                                |
| Mobile (optional)   | Expo Go, Android Studio emulator, or Xcode Simulator (macOS only) | See [local setup](docs/development/local-setup.md#mobile-apps) |

## Quick start

```bash
corepack enable                 # once per machine
pnpm install                    # installs from pnpm-lock.yaml
pnpm env:init                   # creates .env files from the templates (never overwrites)
pnpm infra:up                   # PostgreSQL + PostGIS, waits until healthy
pnpm db:check                   # → "OK: PostgreSQL 18.x, PostGIS 3.6.x ..."
pnpm db:migrate                 # applies SQL migrations (idempotent)
pnpm dev                        # web (:3000) + API (:4000)
curl http://localhost:4000/api/v1/health
```

Full, per-OS instructions: [docs/development/local-setup.md](docs/development/local-setup.md).

## Commands

All commands run from the repository root.

| Task                                          | Command                                                    |
| --------------------------------------------- | ---------------------------------------------------------- |
| Install dependencies (from lockfile)          | `pnpm install` (CI: `pnpm install --frozen-lockfile`)      |
| Create local env files                        | `pnpm env:init`                                            |
| Run web + API                                 | `pnpm dev`                                                 |
| Run everything (web, API, both Metro servers) | `pnpm dev:all`                                             |
| Run only the web app                          | `pnpm dev:web`                                             |
| Run only the API                              | `pnpm dev:api`                                             |
| Run only the passenger app                    | `pnpm dev:passenger`                                       |
| Run only the transport-provider app           | `pnpm dev:transport`                                       |
| Lint                                          | `pnpm lint`                                                |
| Type-check                                    | `pnpm typecheck`                                           |
| Unit tests                                    | `pnpm test`                                                |
| API end-to-end tests (needs database)         | `E2E_EXPECT_DATABASE=true pnpm test:e2e`                   |
| Lint + typecheck + tests                      | `pnpm check`                                               |
| Format / check formatting                     | `pnpm format` / `pnpm format:check`                        |
| Build web + API (+ shared packages)           | `pnpm build` (or `pnpm build:web`, `pnpm build:api`)       |
| Start database                                | `pnpm infra:up`                                            |
| Start database + Redis                        | `pnpm infra:up:redis`                                      |
| Stop infrastructure (keeps data)              | `pnpm infra:down`                                          |
| Container status / logs                       | `pnpm infra:ps` / `pnpm infra:logs`                        |
| Check DB connectivity + PostGIS               | `pnpm db:check`                                            |
| Apply database migrations                     | `pnpm db:migrate`                                          |
| Generate a migration after a schema change    | `pnpm db:generate --name=<change>`                         |
| Open `psql` in the container                  | `pnpm db:psql`                                             |
| Grant a platform staff role                   | `pnpm platform:grant --email you@example.com --role admin` |
| **Delete** local DB/Redis data                | `pnpm infra:reset` (asks for confirmation)                 |

> ⚠️ `pnpm infra:reset` runs `docker compose down --volumes`. Deleting Docker volumes
> **permanently removes all local database data.** It asks you to type `vtp` first.

Redis is optional and off by default; nothing in the default `pnpm dev` flow needs it.

## Health endpoints

| Endpoint                   | Meaning                       | Status codes |
| -------------------------- | ----------------------------- | ------------ |
| `GET /api/v1/health`       | Liveness: the process is up   | 200          |
| `GET /api/v1/health/ready` | Readiness: PostgreSQL answers | 200 / 503    |

## Troubleshooting

| Symptom                                                    | Fix                                                                                                                                         |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `ERR_PNPM_UNSUPPORTED_ENGINE`                              | Use Node 24 (`nvm use`) and run `corepack enable`.                                                                                          |
| API exits with `Invalid environment configuration`         | The message lists each bad variable by name. Run `pnpm env:init` and compare with `apps/api/.env.example`.                                  |
| API exits with `AUTH_SECRET: Invalid input` after updating | Your `apps/api/.env` predates authentication. Copy the `AUTH_*` and `OTP_*` lines from `apps/api/.env.example`.                             |
| `/health/ready` returns 503                                | Database is down or credentials differ: `pnpm infra:ps`, `pnpm db:check`. Root `.env` `POSTGRES_*` must match `apps/api/.env` `DATABASE_*`. |
| Port 5432 already in use                                   | A local PostgreSQL is running. Set `POSTGRES_PORT=5433` in `.env` **and** `DATABASE_PORT=5433` in `apps/api/.env`.                          |
| Changed `POSTGRES_PASSWORD` but login fails                | The password is only applied when the volume is first created. Either change it inside PostgreSQL or reset local data (`pnpm infra:reset`). |
| Mobile app cannot reach the API                            | `localhost` on a phone/emulator is the device itself. See [mobile networking](docs/development/local-setup.md#mobile-apps).                 |
| Browser blocked by CORS                                    | Add the exact origin to `CORS_ORIGINS` in `apps/api/.env`.                                                                                  |
| Metro serves stale code after dependency changes           | `pnpm --filter @vtp/passenger-mobile exec expo start --clear --port 8081`                                                                   |

## Documentation

- [Architecture overview](docs/architecture/overview.md)
- [Architecture decisions](docs/architecture/decisions.md)
- [Authentication](docs/architecture/authentication.md)
- [Organizations, roles and invitations](docs/architecture/organizations.md)
- [Driver and staff applications (KYC)](docs/architecture/onboarding.md)
- [Web portal and admin panel](docs/architecture/web-portal.md)
- [Mobile apps](docs/architecture/mobile-apps.md)
- [Local setup (Windows, macOS, Linux)](docs/development/local-setup.md)
- [Environment variables](docs/development/environment-variables.md)
- [Repository workflow](docs/development/repository-workflow.md)
- [VPS deployment preparation](docs/deployment/vps-preparation.md)
- [Contributing](CONTRIBUTING.md) · [Security policy](SECURITY.md)
