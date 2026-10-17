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

## ADR-007: Defer the ORM / migration tool

**Decision.** No ORM yet. `DatabaseService` owns a `pg` pool used for health checks.

**Why.** The choice depends on the first real domain module and on how much PostGIS SQL is
needed. Picking now would create code to migrate later.

**When choosing** (with the first domain module), require: versioned, reviewable SQL
migrations; first-class PostGIS support or raw SQL escape hatches; transactions across
modules. Good candidates: **Drizzle ORM + drizzle-kit**, **Kysely + a SQL migration runner**,
or **Prisma** (weaker PostGIS support). Record the result as a new ADR.

**Migration rules regardless of tool.**

- Migrations are committed, forward-only in production, and run as a separate deploy step
  _before_ the new API version starts (never automatically at app boot).
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
web and mobile, GraphQL, an auth provider, and helmet/rate limiting (to be added with the
first public endpoints). Each needs a concrete requirement first.
