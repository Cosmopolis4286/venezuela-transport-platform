# Repository workflow

## Branches

- `main` — always releasable; protected. Changes land only through pull requests with green CI.
- Short-lived branches from `main`, named `<type>/<short-description>`:
  `feat/bus-search-api`, `fix/web-cors-origin`, `chore/upgrade-expo-59`, `docs/vps-backups`.
- Rebase or merge `main` into your branch to stay current; delete the branch after merging.
- No long-lived `develop` branch until there is a real release process that needs one.

Recommended GitHub settings for `main` (Settings → Branches → Add rule): require a pull request,
require status checks **CI / Lint, typecheck, test, build**, **CI / API e2e** and **CI / Mobile
JS bundles**, require branches to be up to date, block force pushes and deletions.

## Commits — Conventional Commits

```
<type>(<scope>): <summary in imperative mood, ≤ 72 chars>

<optional body: what and why, not how>

<optional footer: BREAKING CHANGE: ..., Closes #123>
```

Types: `feat`, `fix`, `docs`, `refactor`, `test`, `chore`, `ci`, `build`, `perf`.
Scopes: `web`, `passenger`, `transport`, `api`, `shared-types`, `infra`, `deps`, `ci`.

Examples: `feat(api): add terminals module with nearest-terminal query`,
`fix(passenger): use 10.0.2.2 for the Android emulator API URL`,
`chore(deps): upgrade Expo to SDK 59`.

## Pull requests

1. Keep PRs small and focused (ideally under ~400 changed lines excluding lockfile).
2. Fill in the PR template; describe how you tested.
3. `pnpm check` must pass locally; CI must be green.
4. A contract change in `packages/shared-types` updates every consumer in the same PR.
5. Squash-merge with a Conventional Commit title.

## Code review

Reviewers check, in order:

1. **Correctness & scope** — does it do what the issue asks, and nothing unrelated?
2. **Security & privacy** — no secrets, no PII in logs/URLs, authorization on every new endpoint
   (once identity exists), input validated with DTOs.
3. **Boundaries** — modules talk through exported services; no UI shared across web/mobile;
   shared types stay framework-free.
4. **Data** — migrations are reversible or follow expand/contract; indexes for new queries.
5. **Tests & docs** — new behaviour tested; docs and `.env.example` files updated.

For a solo developer: still open PRs (CI runs, history stays readable) and self-review the diff
on GitHub before merging.

## Dependency updates

- Dependabot (`.github/dependabot.yml`) opens grouped PRs weekly for npm and monthly for
  GitHub Actions and Docker images.
- **Expo:** upgrade one SDK at a time with `npx expo install expo@^<next> --fix` in each app;
  React and React Native versions follow the SDK — never bump them independently.
- **Majors** (Next, NestJS, TypeScript, ESLint): one per PR, read the release notes, run the
  full verification in [local-setup.md](local-setup.md#5-verify-everything).
- Review `pnpm audit --prod` output monthly. New dependencies need a short justification in
  the PR (prefer the platform/standard library first).
- pnpm blocks dependency install scripts by default; allow one only via
  `onlyBuiltDependencies` in `pnpm-workspace.yaml` after reviewing what it runs.
