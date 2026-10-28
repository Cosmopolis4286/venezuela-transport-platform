# Local setup

Tested on Linux (Ubuntu 24.04, Node 24.22.0, pnpm 10.34.7, Docker 29.8 / Compose 5.6).
macOS and Windows steps follow the official installers; they have not been run in CI.

## 1. Install the tools

### macOS

```bash
# Node via a version manager (reads .nvmrc)
brew install fnm && fnm install 24 && fnm use 24
corepack enable
# Docker Desktop (or OrbStack / Colima)
brew install --cask docker
# iOS Simulator: install Xcode from the App Store, then
xcode-select --install
```

### Linux (Ubuntu/Debian)

```bash
curl -fsSL https://fnm.vercel.app/install | bash   # or nvm
fnm install 24 && fnm use 24
corepack enable
# Docker Engine + Compose plugin: https://docs.docker.com/engine/install/ubuntu/
sudo usermod -aG docker "$USER"   # log out and back in afterwards
```

### Windows

Use **WSL 2 (Ubuntu)** for the repository and all commands; it avoids path, line-ending and
file-watching problems with Metro and Next.js.

1. `wsl --install -d Ubuntu` (PowerShell as admin), reboot.
2. Install **Docker Desktop** with the WSL 2 backend and enable integration for Ubuntu.
3. Inside Ubuntu, follow the Linux steps above. Clone the repo into the Linux filesystem
   (`~/code/...`), **not** under `/mnt/c/`.
4. Android emulator runs on Windows (Android Studio). See _Mobile apps_ below for networking.

`.gitattributes` forces LF line endings, so Windows Git settings do not matter.

## 2. Clone, install, configure

```bash
git clone https://github.com/Cosmopolis4286/venezuela-transport-platform.git
cd venezuela-transport-platform
corepack enable
pnpm install          # uses pnpm-lock.yaml; fails on wrong Node/pnpm versions (engine-strict)
pnpm env:init         # creates .env, apps/api/.env, apps/web/.env.local, apps/*-mobile/.env
```

The generated files contain placeholders that work together out of the box. If you change
the database password, change it in **both** `.env` (`POSTGRES_PASSWORD`) and `apps/api/.env`
(`DATABASE_PASSWORD`). See [environment-variables.md](environment-variables.md).

## 3. Database

```bash
pnpm infra:up         # starts postgis/postgis:18-3.6 and waits for the health check
pnpm db:check         # OK: PostgreSQL 18.x, PostGIS 3.6.x at 127.0.0.1:5432/vtp_dev
pnpm db:migrate       # applies apps/api/drizzle/*.sql
pnpm db:psql          # interactive psql inside the container
```

**Initialization strategy.** On the _first_ start with an empty volume, the image creates the
database/user from `.env` and runs `infrastructure/docker/postgres/init/*.sql`, which enables
`postgis`, `pgcrypto`, `citext` and `pg_trgm`. Later starts reuse the volume and skip
initialization. Tables come from migrations — apply them after the database starts:

```bash
pnpm db:migrate       # idempotent; safe to run any time
```

See [decisions](../architecture/decisions.md#adr-007-drizzle-orm-with-committed-sql-migrations)
for generating new migrations.

**Data lifetime.** Data lives in the named volume `vtp_postgres-data`. `pnpm infra:down` keeps
it. `pnpm infra:reset` **permanently deletes it** (asks you to type `vtp`). Back up first if needed:

```bash
docker compose exec postgres sh -c 'pg_dump -U "$POSTGRES_USER" -Fc "$POSTGRES_DB"' > backup.dump
# restore into a fresh database:
docker compose exec -T postgres sh -c 'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists' < backup.dump
```

Ports are bound to `127.0.0.1`, so the database is not reachable from other machines.

Optional Redis: `pnpm infra:up:redis` (adds `redis:8.10-alpine` on `127.0.0.1:6379`).

## 4. Run the apps

```bash
pnpm dev              # web http://localhost:3000 + API http://localhost:4000/api/v1
pnpm dev:api          # API only (watch mode) — Swagger at http://localhost:4000/api/docs
pnpm dev:web          # web only
pnpm dev:passenger    # Metro for the passenger app on :8081
pnpm dev:transport    # Metro for the transport-provider app on :8082
pnpm dev:all          # all of the above in one Turborepo TUI
```

The API starts even if the database is down; `/api/v1/health/ready` then returns 503.

In development, one-time sign-in codes are **printed to the API console** (`OTP_DELIVERY=console`),
look for `[DEV ONLY] login code for +58 *** ***4567 via sms: 123456`. No SMS/WhatsApp/e-mail
provider is integrated yet.

## Mobile apps

To run the API (and the website) in Docker instead, see [docker.md](docker.md). Step-by-step
testing on a phone, an emulator or as an APK: [android-testing.md](android-testing.md).

Docker is **not** used for mobile development. Each app runs its own Metro bundler; open it
with one of:

| Target           | How                                                                   | Requirements                     |
| ---------------- | --------------------------------------------------------------------- | -------------------------------- |
| Physical phone   | Install **Expo Go**, scan the QR code printed by `pnpm dev:passenger` | Same Wi-Fi as the computer       |
| Android emulator | Press `a` in the Metro terminal                                       | Android Studio + an AVD (any OS) |
| iOS Simulator    | Press `i` in the Metro terminal                                       | **macOS with Xcode only**        |

**Reaching the API from a device.** `localhost` inside a phone or emulator is the device
itself. Set `EXPO_PUBLIC_API_BASE_URL` in the app's `.env`:

- Android emulator → `http://10.0.2.2:4000/api/v1`
- Physical device → `http://<your-LAN-IP>:4000/api/v1`, and set `API_HOST=0.0.0.0` in
  `apps/api/.env` so the API listens on the network (only do this on trusted networks).
- WSL 2 + physical device → either use `npx expo start --tunnel` for Metro and expose the API
  via your Windows host IP with a port proxy, or enable WSL "mirrored" networking mode.

Then restart Metro with a clean cache:
`pnpm --filter @vtp/passenger-mobile exec expo start --clear --port 8081`.

**Browser preview.** `pnpm --filter @vtp/transport-mobile dev --web` (or `passenger-mobile`)
opens the app in a browser at http://localhost:8082 (8081), handy for checking screens without an
emulator. The session lives in memory there, so a page reload signs you out
([details](../architecture/mobile-apps.md#browser-preview)). If you created `apps/api/.env` before
this was added, add `http://localhost:8081,http://localhost:8082` to its `CORS_ORIGINS`.

**Limitations.**

- Expo Go only contains Expo's bundled native modules. Adding a library with custom native
  code requires a development build (`npx expo run:android|ios` or EAS Build).
- Store builds and signing need Apple/Google accounts and EAS credentials; none are configured.
  CI only produces JS bundles (`expo export`), which require no credentials.
- `pnpm --filter @vtp/passenger-mobile doctor` runs `expo-doctor`, which needs internet access
  to Expo's API.

## Platform administrator (first time)

Sign up once (e.g. with a code to your phone), then grant yourself the admin role from the
repository root:

```bash
pnpm platform:grant --phone 0414-1234567 --role admin
```

Admins and reviewers approve newly registered organizations. See
[organizations.md](../architecture/organizations.md).

## 5. Verify everything

```bash
pnpm check                              # lint + typecheck + unit tests
pnpm build                              # web + API production builds
E2E_EXPECT_DATABASE=true pnpm test:e2e  # API e2e against the local database
pnpm turbo run export                   # Metro bundles for both mobile apps
curl -s localhost:4000/api/v1/health    # {"status":"ok",...} while pnpm dev:api runs
```
