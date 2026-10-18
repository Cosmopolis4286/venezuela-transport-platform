# Architecture decisions

Lightweight ADRs. Add a new entry instead of rewriting an old one; mark superseded entries.

## ADR-001: One monorepo with separate apps

**Decision.** A single Git repository (`venezuela-transport-platform`) using a pnpm workspace
and Turborepo, with each application isolated in `apps/*`.

**Why.** One developer (or a small team) maintains everything; API contract changes and their
consumers can land in one PR; one CI pipeline, one set of tooling; no cross-repo version
syncing. Turborepo only runs tasks for affected packages and caches the rest.

**Trade-offs.** CI and installs cover more code; repository permissions are all-or-nothing.
If an app later needs a separate team or access control, `git subtree split` can extract it.

**Rejected.** Four repositories (sync overhead with no current benefit).

## ADR-002: Separate repository from PlayRKE

The machine this was set up on already contained the unrelated PlayRKE project
(Laravel + Nuxt). This platform lives in its **own** repository so neither project's history,
CI or tooling affects the other. Nothing was copied from PlayRKE.

## ADR-003: Runtime and package manager versions

| Choice               | Why                                                                                                                                 |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Node.js **24 LTS**   | Current Active LTS. Node 22 was rejected because `@nestjs/schematics` 12 requires `>=22.22.3` and 24 has the longer support window. |
| pnpm **10.34.x**     | Mature line, fully supported by Expo, Turborepo and `pnpm/action-setup`. pnpm 11/12 exist; upgrade deliberately later.              |
| TypeScript **6.0.x** | TypeScript 7 is released, but `typescript-eslint` 8 supports `<6.1`. Revisit when it adds TS 7 support.                             |
| ESLint **9.39.x**    | ESLint 10 is out, but `eslint-config-expo` depends on `eslint-plugin-react`/`-import` that only declare support up to ESLint 9.     |
| pnpm `catalog:`      | Shared versions (TypeScript, React, ESLint, zod, vitest…) declared once in `pnpm-workspace.yaml`.                                   |

## ADR-004: Framework versions & generators

All apps were created with their official generators (`create-next-app@16.4.2`,
`create-expo-app` with the SDK 58 `blank-typescript` template, `@nestjs/cli@12`) and then
trimmed. Notable consequences:

- **NestJS 12 is ESM** (`"type": "module"`, `.js` import suffixes) and its CLI now generates
  **Vitest** instead of Jest; we kept Vitest. Its default `oxlint` was replaced by ESLint so
  every package uses the same linter.
- **Next.js 16.4** uses Turbopack and `@tailwindcss/turbopack`; `cacheComponents` and
  `partialPrefetching` are left on as generated. Google Fonts were removed so builds work
  offline and do not depend on third-party font fetches.
- **Expo SDK 58** with Expo Router; routes live in `src/app/`. Native `ios/` and `android/`
  folders are generated (CNG) and git-ignored.

## ADR-005: pnpm isolated `node_modules` (no hoisting)

Expo SDK 58's Metro config handles pnpm's isolated layout; both apps were verified with
`expo export` for Android and iOS. We therefore do **not** set `node-linker=hoisted`. If a
future native library breaks under isolation, switching to `node-linker=hoisted` in `.npmrc`
is the documented fallback.

## ADR-006: shadcn/ui installed manually

The environment used for the initial setup could not reach `ui.shadcn.com`, so shadcn/ui was
configured following its manual-installation guide: `components.json`, `src/lib/utils.ts`
(`cn`), theme tokens in `globals.css`, and the `Button` component. The CLI works normally on
an unrestricted network: `pnpm --filter @vtp/web exec shadcn add <component>`.

## ADR-007: Drizzle ORM with committed SQL migrations

_Supersedes the initial "defer the ORM" decision from the foundation PR._

**Decision.** Drizzle ORM (`drizzle-orm` 0.45) for queries and `drizzle-kit` 0.31 to generate
SQL migrations. Migrations are applied by our own runner (`apps/api/src/database/migrate.ts`,
`pnpm db:migrate`), which uses Drizzle's migrator and its `drizzle.__drizzle_migrations` table.

**Why.** Generated migrations are plain, reviewable SQL files; custom SQL migrations
(`--custom`) cover PostGIS features the schema DSL does not; queries stay close to SQL and
fully typed; no code-generation step or engine binary (unlike Prisma, whose PostGIS support is
weaker). Kysely was the runner-up; it needs a separate migration tool.

**How it works.**

| Piece                          | Location                                                                              |
| ------------------------------ | ------------------------------------------------------------------------------------- |
| Module tables                  | `src/modules/<name>/<name>.schema.ts`, re-exported from `src/database/schema.ts`      |
| Migrations                     | `apps/api/drizzle/NNNN_<name>.sql` + `meta/` journal and snapshots (commit all of it) |
| Generate after a schema change | `pnpm db:generate --name=<change>`                                                    |
| Hand-written SQL migration     | `pnpm --filter @vtp/api exec drizzle-kit generate --custom --name=<change>`           |
| Apply                          | `pnpm db:migrate` (dev) · `node dist/database/migrate.js` (production image)          |
| Query from a module            | inject `DatabaseService`, use `database.db` (Drizzle) or `database.pool` (raw SQL)    |

`0000_baseline_extensions.sql` creates `postgis`, `pgcrypto`, `citext` and `pg_trgm` with
`IF NOT EXISTS`, so production databases that never ran the Docker init SQL get them too.
PostGIS is not a trusted extension: on managed databases an admin may have to create it first.

CI applies migrations twice (idempotence) and fails if `db:generate` would produce a migration
that is not committed (schema drift).

**Migration rules.**

- Migrations are committed, reviewed like code, forward-only in production, and run as a
  separate deploy step _before_ the new API version starts (never automatically at app boot).
- Never edit a migration that has been applied anywhere shared; add a new one.
- `infrastructure/docker/postgres/init/` only enables extensions. It runs once on an empty
  volume and must never contain tables.
- Destructive changes use expand → migrate data → contract across releases.

## ADR-008: Optional Redis via a Compose profile

Redis is defined under the `redis` profile and is not started by `pnpm infra:up`. BullMQ is
**not** installed. Add it with the first real background job (notifications, settlements).
`REDIS_URL` is validated if set and ignored otherwise.

## ADR-009: Configuration and secrets

- Each app validates its own environment at start-up (API: zod in `config/env.schema.ts`; web:
  `src/lib/env.ts`; mobile: `src/config/env.ts`).
- Secrets exist only on the server side (API). `NEXT_PUBLIC_*` and `EXPO_PUBLIC_*` values are
  **public by definition** — they ship inside browser bundles and app binaries.
- Production reads real environment variables; the API ignores `.env` files when
  `NODE_ENV=production`.

## ADR-010: Testing stack

Vitest for the API, shared packages and web utilities; `jest-expo` for the mobile apps (Expo's
supported path). API e2e tests use Supertest against the real app configuration
(`configureApp`) and, in CI, a PostGIS service container.

## ADR-011: What we deliberately did not add

Kubernetes, Terraform, microservices, paid observability, a component library shared between
web and mobile, GraphQL and an auth provider. Each needs a concrete requirement first.

## ADR-012: Reference production images and Compose

Multi-stage Dockerfiles on `node:24.22.0-trixie-slim` (glibc, so native modules need no
musl rebuilds) and a single-VPS Compose stack with **Caddy** for automatic HTTPS. Chosen over
Nginx + certbot for fewer moving parts. Images are built in CI but not pushed; publishing and
deployment need registry credentials and an explicit decision. Image sizes at creation:
API ≈ 490 MB, web ≈ 390 MB (mostly the Node base image).

## ADR-013: Opaque session tokens, scrypt passwords and one-time codes

**Decision.** Opaque random access/refresh tokens stored as HMAC hashes in a `sessions` table,
instead of JWTs. Passwords hashed with Node's built-in scrypt. Passengers can sign in with
e-mail + password or with one-time codes (SMS, WhatsApp, e-mail); staff accounts are the same users
with organization memberships added by invitation or after KYC approval.

**Why.** Every session is revocable immediately (logout, suspension, token replay) without a
deny-list; there is no signing-key management; the per-request lookup is one indexed query, which
is fine at this scale and can be cached later. scrypt needs no native module. Codes cover users
without e-mail, which is common for passengers in Venezuela.

**Trade-offs.** Each authenticated request hits the database; if that becomes a bottleneck, cache
session lookups in Redis. Code delivery costs money per message, so it is rate-limited per
destination and per IP, and stays `disabled` in production until a provider is chosen.

## ADR-014: Organization roles in code, invitations bound to verified contacts

**Decision.** One enum of organization roles, a per-type allow-list (taxi lines have no ticket
agents or inspectors) and a role → permission matrix defined in `@vtp/shared-types`, enforced by
the API through a route guard. Invitations target an e-mail or phone, and are accepted by a
signed-in user who has verified that contact; there are no invitation links or tokens.

**Why.** A fixed matrix is easy to review and test, and enough for the known roles; per-tenant
custom roles can come later if operators ask for them. Contact-bound invitations need no extra
secret, work before any SMS/e-mail provider exists, and cannot be used by whoever intercepts a
message.

**Trade-offs.** Changing a role's permissions is a code change and a release. One role per
membership: a person who both dispatches and drives needs the broader role (e.g. owner/admin) or
the matrix extended.

## ADR-015: KYC applications with platform review and organization consent

**Decision.** Drivers and staff who are not invited submit an application with documents. Platform
reviewers verify identity and documents; if the applicant named an organization, that organization
then accepts or declines. Files go through a `FileStorage` interface, local disk for now.

**Why.** KYC is a platform responsibility (consistent checks, one place for personal data), while
hiring stays the organization's decision. A storage interface lets the MVP run on one VPS and move
to S3-compatible storage without touching business code.

**Trade-offs.** Local storage ties the API to one server and its volume must be backed up with the
database. No automated identity verification yet: reviewers check documents by hand.
