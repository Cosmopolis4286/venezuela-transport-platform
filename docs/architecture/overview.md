# Architecture overview

## Context

The platform will connect passengers, bus companies, terminals, taxi drivers and transport
operators in Venezuela: bus search, reservations and tickets with QR validation, seat
availability, taxi dispatch to/from terminals, payments and settlements, notifications,
reporting, and organization-based roles. **None of that is implemented yet.** This document
describes the boundaries the foundation sets up so those features have an obvious home.

## System diagram

```
 ┌────────────────────┐  ┌────────────────────────┐  ┌──────────────────────────┐
 │ apps/web (Next.js) │  │ apps/passenger-mobile   │  │ apps/transport-mobile    │
 │  /        public   │  │ (Expo, passengers)      │  │ (Expo, drivers/operators)│
 │  /portal  operators│  │                         │  │                          │
 └─────────┬──────────┘  └───────────┬────────────┘  └────────────┬─────────────┘
           │        HTTPS · JSON · /api/v1/*  (shared contracts: @vtp/shared-types)
           └─────────────────────────┼────────────────────────────┘
                                     ▼
                     ┌──────────────────────────────────┐
                     │ apps/api — NestJS modular monolith│
                     │  config · logging · validation    │
                     │  modules/health (+ future modules) │
                     └───────────┬──────────────┬───────┘
                                 ▼              ▼ (optional, later)
                     PostgreSQL 18 + PostGIS    Redis 8 / BullMQ
```

## Applications

| App                     | Audience                                              | Responsibility                                                                                                                                                       | Talks to                     |
| ----------------------- | ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| `apps/web`              | Public visitors; staff of bus companies and terminals | Public site and bus search (route group `(public)`), operator portal under `/portal` with its own layout. `/portal/layout.tsx` is the future authorization boundary. | API over HTTPS               |
| `apps/passenger-mobile` | Passengers                                            | Search, booking, tickets, taxi requests (future)                                                                                                                     | API over HTTPS               |
| `apps/transport-mobile` | Taxi drivers, bus crews, terminal operators           | Trip/dispatch handling, QR ticket validation (future)                                                                                                                | API over HTTPS               |
| `apps/api`              | All clients                                           | Single source of truth for business rules, authorization and data                                                                                                    | PostgreSQL, Redis (optional) |

Rules:

- **Clients never talk to the database or to each other.** Everything goes through the API.
- **The two mobile apps stay separate.** Different users, permissions, release cadence and
  app-store listings. They may share _contracts_ (`@vtp/shared-types`) but not UI code.
- **Web and mobile do not share UI components.** React DOM and React Native components are
  different; sharing would couple their release cycles for little gain.
- The public website and the operator portal share one Next.js app but use separate route
  trees and layouts, so they can get separate auth middleware later without a new deployment.

## Backend: modular monolith

One deployable NestJS process, internally split into modules with explicit boundaries.

```
apps/api/src/
├── main.ts               # bootstrap: listen, log URLs
├── app.setup.ts          # prefix /api, URI versioning, validation, error filter, CORS, Swagger
├── app.module.ts         # wires config, logger, database, feature modules
├── common/               # cross-cutting: filters/, pipes/, interceptors/
├── config/               # env schema (zod), typed AppConfigService, logger config
├── database/             # pg Pool lifecycle + ping (no ORM yet — see decisions.md)
├── docs/                 # OpenAPI/Swagger setup
└── modules/
    └── health/           # liveness + readiness
```

### Adding a feature module

Planned modules, roughly in dependency order:

| Module          | Owns                                                                          |
| --------------- | ----------------------------------------------------------------------------- |
| `identity`      | Users, credentials, sessions/tokens, device registration                      |
| `organizations` | Bus companies, taxi cooperatives, terminals as tenants; memberships and roles |
| `terminals`     | Terminals, platforms/bays, geolocation (PostGIS)                              |
| `routes`        | Cities, stops, routes, distances (PostGIS)                                    |
| `fleet`         | Vehicles, seat maps, drivers' assignments                                     |
| `schedules`     | Departures, frequencies, exceptions                                           |
| `bookings`      | Seat holds, reservations, passenger manifests                                 |
| `ticketing`     | Ticket issuance, QR codes, validation/check-in                                |
| `taxi-dispatch` | Taxi requests, matching, trip lifecycle (WebSockets only if justified)        |
| `payments`      | Payment intents, provider integrations, settlements to operators              |
| `notifications` | SMS / push / e-mail delivery, templates                                       |
| `reporting`     | Read models and exports for operators                                         |

Conventions for each new module (`apps/api/src/modules/<name>/`):

1. `<name>.module.ts`, controllers, services, DTOs (`class-validator`), and tests next to the code.
2. **A module exposes a service API via `exports`; other modules use only that.** No reaching into
   another module's tables or internal providers. If two modules need the same data, one owns it
   and the other asks through its exported service.
3. Each module owns its tables. Cross-module foreign keys are allowed only toward the owning
   module's identifiers (e.g. `organization_id`).
4. Controllers declare `version: '1'`; DTOs that cross the wire have a matching contract type in
   `@vtp/shared-types` once a client consumes them.
5. Register the module in `app.module.ts` and add an e2e test for its main endpoints.
6. Split a module into its own service **only** with evidence (independent scaling, team
   ownership, failure isolation). Clean module boundaries keep that option cheap.

### Cross-cutting behaviour already in place

| Concern          | Implementation                                                                                                                                                                                |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Versioning       | Global prefix `api` + URI versioning, default `v1` → `/api/v1/...`                                                                                                                            |
| Validation       | Global `ValidationPipe`: whitelist, reject unknown fields, transform; never echoes values                                                                                                     |
| Errors           | `HttpExceptionFilter` → `ApiErrorResponse` (`packages/shared-types/src/api/errors.ts`)                                                                                                        |
| Config           | `zod` schema validated at boot; process exits listing invalid variable names                                                                                                                  |
| Logging          | `nestjs-pino`: JSON in prod, pretty in dev; request IDs (`x-request-id`); auth headers/cookies redacted; query strings and bodies not logged                                                  |
| CORS             | Explicit allowlist from `CORS_ORIGINS`; `*` rejected in production                                                                                                                            |
| API docs         | Swagger at `/api/docs`, on by default outside production                                                                                                                                      |
| Shutdown         | `enableShutdownHooks()`; DB pool closed on SIGTERM/SIGINT                                                                                                                                     |
| Health           | `/api/v1/health` (liveness), `/api/v1/health/ready` (DB readiness, 503 when down)                                                                                                             |
| Security headers | `helmet` defaults (CSP, HSTS, nosniff, frame-ancestors…); `x-powered-by` removed                                                                                                              |
| Rate limiting    | `@nestjs/throttler` global guard per client IP (`RATE_LIMIT_*`); health probes exempt via `@SkipThrottle()`. In-memory store: move to Redis storage before running more than one API instance |
| Proxies          | `trust proxy` set from `API_TRUST_PROXY_HOPS` so client IPs are correct behind Caddy/Nginx                                                                                                    |
| Authentication   | Global `AuthGuard`: every route requires a bearer access token unless marked `@Public()`. See [authentication.md](authentication.md)                                                          |
| Audit log        | `AuditService.record()` → `audit_events` (identifiers only, never secrets or raw PII)                                                                                                         |

**Not in place yet (do not assume they exist):** organization-level authorization (roles and
permissions), background jobs.

## Data

- **PostgreSQL 18 + PostGIS 3.6.** PostGIS covers terminal locations, route geometry and
  nearest-taxi queries without a separate geo service.
- Extensions enabled on first init: `postgis`, `pgcrypto`, `citext`, `pg_trgm`
  (`infrastructure/docker/postgres/init/001-extensions.sql`).
- Time zone: containers run in `America/Caracas`; **store timestamps as `timestamptz`** and
  convert at the edges.
- Schema changes go through committed SQL migrations generated with drizzle-kit and applied by
  `pnpm db:migrate` — see [decisions](decisions.md#adr-007-drizzle-orm-with-committed-sql-migrations).
  Each module owns its tables in `src/modules/<name>/<name>.schema.ts`.

## Shared contracts (`@vtp/shared-types`)

- Pure TypeScript: no React, React Native, Next.js or NestJS imports, no runtime dependencies.
- Holds wire contracts only: request/response shapes, error codes, API version constants.
  **Not** entities, ORM models or internal service types.
- Built to `dist/` (ESM + `.d.ts`); Turbo builds it before any dependant (`dependsOn: ["^build"]`).

### Error convention

Every non-2xx response has this body:

```json
{
  "error": {
    "code": "VALIDATION_FAILED",
    "message": "Request validation failed",
    "details": [{ "field": "email", "message": "email must be an email" }],
    "requestId": "8f0c…",
    "timestamp": "2026-10-17T12:00:00.000Z"
  }
}
```

Clients branch on `code` (a closed list, `API_ERROR_CODES`), show `message`, and display
`requestId` in support flows. `isApiErrorResponse()` is a runtime guard for clients.

### Evolving contracts

- **Additive changes** (new optional field, new endpoint, new error code) are fine within `v1`.
- **Breaking changes** (removing/renaming a field, changing a type, making a field required in a
  request) need either a new endpoint version (`version: '2'`) or a coordinated change that
  updates the API and every consumer in the same PR — and, for mobile, only after old app
  versions in the field are unsupported. **Assume mobile clients lag behind by weeks.**
- Keep OpenAPI (generated from the NestJS controllers) as the external reference; shared types
  are the internal TypeScript convenience. Consider generating one from the other once the API
  grows.

## Communication

- REST/JSON over HTTPS, versioned under `/api/v1`.
- WebSockets only when a feature needs server push (e.g. live taxi position). Polling is
  acceptable for the first iterations.
- Background work (notifications, settlements) → BullMQ on Redis once a real job exists; the
  Compose `redis` profile is ready for it.
