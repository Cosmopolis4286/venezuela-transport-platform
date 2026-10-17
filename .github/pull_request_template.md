## What and why

<!-- What does this change do, and why is it needed? Link the issue: Closes #123 -->

## Affected areas

- [ ] `apps/web`
- [ ] `apps/passenger-mobile`
- [ ] `apps/transport-mobile`
- [ ] `apps/api`
- [ ] `packages/*`
- [ ] Infrastructure / CI / docs

## How it was tested

<!-- Commands run and their result, manual checks, screenshots for UI changes. -->

## Checklist

- [ ] `pnpm check` passes locally (lint, typecheck, tests)
- [ ] No secrets, real credentials or personal data in code, fixtures, logs or screenshots
- [ ] New environment variables are added to the relevant `.env.example` and `docs/development/environment-variables.md`
- [ ] Database changes are delivered as a migration (never edits to the init SQL)
- [ ] Shared contract changes in `packages/shared-types` are backwards compatible, or every consumer is updated in this PR
- [ ] Docs updated where behaviour or commands changed
