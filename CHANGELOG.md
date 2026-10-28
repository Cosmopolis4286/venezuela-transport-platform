# Changelog

Notable changes to the Venezuela Transport Platform, newest first. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); the project has no releases yet, so
changes are grouped by the date they reached `main`, with the pull request that brought them.
What is done and what is still pending is tracked in [docs/roadmap.md](docs/roadmap.md).

When a pull request changes behaviour, add a line under **Unreleased** in the same pull request.

## Unreleased

### Added

- **Self-hosted CI** (ADR-022): a GitHub Actions workflow that runs the CircleCI jobs on a runner
  on the maintainer's machine (Windows + WSL 2), at no cost. Setup in
  [docs/development/self-hosted-runner.md](docs/development/self-hosted-runner.md).
- `CHANGELOG.md` and the [roadmap](docs/roadmap.md).
- **Run the platform in Docker** ([docker.md](docs/development/docker.md)): `pnpm stack:api`
  (hybrid: database and API in Docker, frontends on your machine) and `pnpm stack:app` (database,
  API and website from the production images, with development settings). Migrations run
  automatically.
- [Android testing guide](docs/development/android-testing.md): Expo Go, emulator and APK.

### Fixed

- The API image no longer fails to start with `NODE_ENV=development`: the pretty log printer is
  used only when installed.

## 2026-10-27

### Added

- **Ticket scanner in the transport app** (#29). Inspectors, admins and owners scan the
  passenger's QR with the camera, or type the booking code and seat, and see at once whether the
  passenger may board. The first valid scan marks boarding; a reused QR shows when it was used.
  Ticket validation now reports `not_paid` and `other_departure` with the passenger's details
  instead of an error.
- **Payments and QR tickets** (#23, step 3 of ADR-018). Operators set exchange rates (bolívares
  and reais per dollar). Passengers pay a held booking by pago móvil, bank transfer, PIX or USDT,
  with the amount converted and frozen, and get one QR ticket per seat once the payment is
  confirmed. A simulated provider drives the flow until real providers are contracted; production
  configuration refuses it. Late or wrong payments are marked for refund.
- **Seat bookings** (#20, step 2 of ADR-018). Passengers choose seats on the bus map and hold
  them for 15 minutes (`BOOKING_HOLD_MINUTES`); no seat can be sold twice, even under concurrent
  requests. "Mis viajes" in the passenger app. Operators see trips by date and the passenger list
  for boarding. Search results show free seats.
- Migrations `0006_bookings` and `0007_payments_and_tickets`.
- New configuration: `BOOKING_HOLD_MINUTES`, `PAYMENT_PROVIDER`.

### Changed

- **CI moved from GitHub Actions to CircleCI** (#20, ADR-019): quality, API e2e on PostGIS,
  mobile bundles and Docker images.
- Dependabot no longer proposes major `@types/node` updates: the types follow the Node 24
  runtime (#28).
- Dependency updates: Next.js group (#16), Expo SDK 58 patches (#15), development tooling (#26),
  runtime patches (#27).

## 2026-10-19

### Added

- **Seat maps** (#14): operators draw each vehicle type's layout (presets, one or two decks) in the
  portal; schedules take their capacity from the map.
- **Trip search** (#13) on the website (`/buscar`) and in the passenger app: origin, destination
  and date, with times, duration, operator, class and fare. Works without an account.
- **Transport network** (#12): stop catalog (terminals and stops, PostGIS) curated by the
  platform; routes with ordered stops, fares per pair of stops and weekly schedules published by
  each bus company or taxi line; public departure search.

## 2026-10-18

### Added

- **Mobile sign-in** (#11) in both apps, shared through `@vtp/mobile-core` with tokens in the
  device keychain; KYC application with document upload in the transport app.
- **Web portal and admin panel** (#10): sign-in, organization portal (team, invitations,
  applicants), platform review of organizations and KYC applications.
- **Driver and staff applications with KYC documents** (#9): applications, document upload with
  type checks by content, platform review, organization acceptance.
- **Organizations** (#7): bus companies, taxi lines and terminals; roles (owner, admin,
  dispatcher, ticket agent, driver, inspector) with a permission matrix, invitations bound to
  verified contacts, platform review.
- **Identity** (#6): accounts with e-mail + password or one-time codes (SMS, WhatsApp, e-mail),
  rotating refresh tokens, audit log.

### Changed

- CI action and Redis image updates (#8).

## 2026-10-17

### Added

- **Engineering foundation** (#1): pnpm + Turborepo monorepo with the Next.js website, two Expo
  apps, the NestJS API (OpenAPI), shared contracts, PostgreSQL 18 + PostGIS 3.6 in Docker
  Compose, lint, formatting, tests, production images and documentation.
