# Notes for AI coding agents

Monorepo: pnpm 10 workspace + Turborepo, Node 24. Apps in `apps/*`, shared code in `packages/*`.
Each app's `AGENTS.md` (Next.js, Expo) has framework-specific guidance — read it before editing
that app.

- Verify with `pnpm check` (lint, typecheck, tests) and `pnpm build`. API e2e:
  `pnpm infra:up && E2E_EXPECT_DATABASE=true pnpm test:e2e`.
- API is NestJS 12 **ESM**: relative imports need the `.js` suffix. Tests use Vitest.
- Mobile deps: `npx expo install <pkg>` inside the app folder (use `EXPO_OFFLINE=1` if
  api.expo.dev is unreachable). Routes live in `src/app/`.
- `@vtp/shared-types` must stay framework-free and is consumed from `dist/` — Turbo builds it first.
- Database: Drizzle ORM. Module tables go in `src/modules/<name>/<name>.schema.ts`, re-exported
  from `src/database/schema.ts`; then `pnpm db:generate --name=<change>` and commit
  `apps/api/drizzle/`. Never edit an applied migration.
- API routes are **private by default** (global `AuthGuard`); mark public ones with `@Public()`
  and get the caller with `@CurrentAuth()`. Use `ApiException` for errors with a stable code; when
  the code is too coarse (a 409), add a `reason` from `API_ERROR_REASONS` with its Spanish text in
  `API_ERROR_REASON_MESSAGES` (`ApiException.conflict(message, reason)`). Clients never match on
  `message`. Venezuelan time: `toNetworkIso`/`networkClock` from `@vtp/shared-types`.
- Organization routes use `@RequireOrganizationAccess(permission)`; roles and the permission
  matrix live in `packages/shared-types/src/api/organizations.ts`.
- Web (`apps/web`): pages that read the session render inside `<Suspense>` (Cache Components);
  call the API only from server code in `src/lib/server`; Server Actions return `FormState`; never
  pass functions from Server to Client Components.
- Mobile: session, API client and sign-in screens are shared in `@vtp/mobile-core` (TypeScript
  source, no build); feature screens stay in each app. Never store tokens outside `secureTokenStore`.
- Files go through `FileStorage` (`src/storage`), never `fs` directly; validate type by content.
- Implemented so far: identity (auth), audit, organizations, onboarding (KYC), network (stops, routes,
  fares, schedules, departure search), fleet (seat maps, vehicles), bookings (trips, seat holds, manifests,
  ticket validation), payments (exchange rates, `PaymentProvider` adapters, simulated provider until real
  ones exist; ADR-018/021), dispatch (vehicle and driver per trip, driver's trips), taxi (rides to and from terminals,
  first line to accept wins, paid to the driver for now). No settlements yet.
- Web forms: use `ActionForm` (pass `resetOnSuccess` only for "add" forms) and map API errors to
  Spanish with `failure(error, messages)` from `src/lib/server/form-actions.ts`.
- Docs live in `docs/`; update `.env.example` files and `docs/development/environment-variables.md`
  whenever configuration changes.
