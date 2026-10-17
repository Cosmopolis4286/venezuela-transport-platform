# Environment variables

`pnpm env:init` copies every template below to its git-ignored target. It never overwrites.

> **Public vs secret.** Variables prefixed `NEXT_PUBLIC_` (web) or `EXPO_PUBLIC_` (mobile) are
> compiled into code that runs on users' devices. Anyone can read them. **Never put a secret in
> them.** Mobile apps have no safe place for API secrets; anything shipped in the app is public.
> Server-side secrets belong only in the API's environment.

## Root `.env` — Docker Compose (local development only)

Template: `.env.example`

| Variable            | Required | Secret  | Default     | Purpose                                                           |
| ------------------- | -------- | ------- | ----------- | ----------------------------------------------------------------- |
| `POSTGRES_DB`       | yes      | no      | `vtp_dev`   | Database created on first start                                   |
| `POSTGRES_USER`     | yes      | no      | `vtp`       | Superuser created on first start                                  |
| `POSTGRES_PASSWORD` | yes      | **yes** | placeholder | Superuser password. Applied only when the volume is first created |
| `POSTGRES_PORT`     | no       | no      | `5432`      | Host port, bound to `127.0.0.1`                                   |
| `REDIS_PORT`        | no       | no      | `6379`      | Host port for the optional Redis, bound to `127.0.0.1`            |

## `apps/api/.env` — API

Template: `apps/api/.env.example`. Validated by `apps/api/src/config/env.schema.ts`; the API
refuses to start and lists invalid variable **names** (never values).

| Variable              | Required | Secret                         | Default                  | Purpose                                                                           |
| --------------------- | -------- | ------------------------------ | ------------------------ | --------------------------------------------------------------------------------- |
| `NODE_ENV`            | no       | no                             | `development`            | `development` \| `test` \| `production`. In production `.env` files are ignored   |
| `APP_VERSION`         | no       | no                             | `0.0.0-dev`              | Reported by `/api/v1/health`. Set to release tag / git SHA                        |
| `API_HOST`            | no       | no                             | `127.0.0.1`              | Bind address. `0.0.0.0` for physical devices on the LAN or inside containers      |
| `API_PORT`            | no       | no                             | `4000`                   | HTTP port                                                                         |
| `CORS_ORIGINS`        | no       | no                             | empty                    | Comma-separated allowed browser origins. Empty = none. `*` rejected in production |
| `LOG_LEVEL`           | no       | no                             | `info`                   | `fatal`…`trace`, or `silent`                                                      |
| `SWAGGER_ENABLED`     | no       | no                             | on, except in production | Serve `/api/docs`                                                                 |
| `DATABASE_HOST`       | yes      | no                             | —                        | PostgreSQL host                                                                   |
| `DATABASE_PORT`       | no       | no                             | `5432`                   | PostgreSQL port                                                                   |
| `DATABASE_NAME`       | yes      | no                             | —                        | Database name (match `POSTGRES_DB` locally)                                       |
| `DATABASE_USER`       | yes      | no                             | —                        | Database user (match `POSTGRES_USER` locally)                                     |
| `DATABASE_PASSWORD`   | yes      | **yes**                        | —                        | In production: 16+ characters and must not contain `change-me`                    |
| `DATABASE_SSL`        | no       | no                             | `false`                  | `true` to require TLS with certificate verification                               |
| `DATABASE_POOL_MAX`   | no       | no                             | `10`                     | Max pool connections (1–100)                                                      |
| `REDIS_URL`           | no       | **yes** (may embed a password) | empty                    | `redis://` or `rediss://` URL. Unused until a feature needs Redis                 |
| `E2E_EXPECT_DATABASE` | no       | no                             | —                        | Test-only: `true` makes e2e tests assert DB readiness                             |

## `apps/web/.env.local` — web (Next.js)

Template: `apps/web/.env.example`. Validated in `apps/web/src/lib/env.ts`; build fails if invalid.

| Variable                   | Required | Secret          | Default                        | Purpose                                                                                  |
| -------------------------- | -------- | --------------- | ------------------------------ | ---------------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_API_BASE_URL` | yes      | **no — public** | `http://localhost:4000/api/v1` | API base URL used by the browser. Inlined at **build** time; changing it needs a rebuild |

Server-only web variables (none yet) must **not** use the `NEXT_PUBLIC_` prefix.

## `apps/passenger-mobile/.env` and `apps/transport-mobile/.env` — mobile (Expo)

Templates: `apps/*-mobile/.env.example`. Validated in `src/config/env.ts`.

| Variable                   | Required | Secret          | Default                        | Purpose                                |
| -------------------------- | -------- | --------------- | ------------------------------ | -------------------------------------- |
| `EXPO_PUBLIC_API_BASE_URL` | yes      | **no — public** | `http://localhost:4000/api/v1` | API base URL embedded in the JS bundle |

Values per target:

| Target                    | Value                                                                            |
| ------------------------- | -------------------------------------------------------------------------------- |
| iOS Simulator (macOS)     | `http://localhost:4000/api/v1`                                                   |
| Android emulator          | `http://10.0.2.2:4000/api/v1`                                                    |
| Physical device (Expo Go) | `http://<computer-LAN-IP>:4000/api/v1` and `API_HOST=0.0.0.0` in `apps/api/.env` |

Restart Metro with `--clear` after changing these values.

## CI

GitHub Actions sets placeholder public URLs and throwaway database credentials inline in
`.github/workflows/ci.yml`. They are not secrets. Real deployment secrets will go in GitHub
**Environments** secrets, never in the workflow file.
