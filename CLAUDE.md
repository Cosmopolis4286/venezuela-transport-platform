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
- No business features exist yet; do not invent auth, bookings or payments unless asked.
- Docs live in `docs/`; update `.env.example` files and `docs/development/environment-variables.md`
  whenever configuration changes.
