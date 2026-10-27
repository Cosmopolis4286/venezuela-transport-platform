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

## Continuous integration (CircleCI)

`.circleci/config.yml` runs one workflow, `ci`, on every push to any branch (pull requests
included). Its four jobs run in parallel:

| Job             | What it proves                                                                                     |
| --------------- | -------------------------------------------------------------------------------------------------- |
| `quality`       | `pnpm format:check`, lint, typecheck, unit tests, and builds of web and API                        |
| `api-e2e`       | Migrations apply twice on PostgreSQL + PostGIS, no schema change lacks a migration, e2e tests pass |
| `mobile-bundle` | Both Expo apps bundle for Android and iOS (JS only, no signing credentials)                        |
| `docker-images` | Production Compose file is valid, API and web images build, the web image answers HTTP             |

**One-time setup (repository owner):**

1. In CircleCI, _Projects → Set Up Project_ for `venezuela-transport-platform`, choosing "use
   the existing `.circleci/config.yml`" (prefer the CircleCI GitHub App, which reports results as
   GitHub checks).
2. _Project Settings → Advanced_: turn on **Auto-cancel redundant workflows** (a new push cancels
   the previous run of the same branch) and keep **Only build pull requests** off so `main` is
   built after each merge.
3. On GitHub, _Settings → Branches_: require the CircleCI checks (`ci/circleci: quality`,
   `api-e2e`, `mobile-bundle`, `docker-images`) before merging into `main`.

The pipeline has no secrets: database credentials and public URLs are throwaway placeholders.
`docker-images` uses a VM (`machine` executor), which costs more credits than the Docker jobs.

### Self-hosted runner (GitHub Actions)

`.github/workflows/self-hosted-ci.yml` runs the same four jobs on a GitHub Actions runner on the
maintainer's machine, which costs no minutes or credits (ADR-022). Use it when the CircleCI
credits run out; require its checks on `main` instead of CircleCI's while that lasts. Setup and
troubleshooting: [self-hosted-runner.md](self-hosted-runner.md).

## Dependency updates

- Dependabot (`.github/dependabot.yml`) opens grouped PRs weekly for npm and monthly for
  Docker images. CircleCI images in `.circleci/config.yml` are pinned by hand: bump the Node
  image together with `.nvmrc` and the production Dockerfiles.
- **Node types:** `@types/node` stays on the runtime's major (24). Dependabot ignores its majors;
  upgrade them in the same PR that moves `.nvmrc`, the Dockerfiles and CircleCI.
- **Expo:** upgrade one SDK at a time with `npx expo install expo@^<next> --fix` in each app;
  React and React Native versions follow the SDK — never bump them independently.
- **Majors** (Next, NestJS, TypeScript, ESLint): one per PR, read the release notes, run the
  full verification in [local-setup.md](local-setup.md#5-verify-everything).
- Review `pnpm audit --prod` output monthly. New dependencies need a short justification in
  the PR (prefer the platform/standard library first).
- pnpm blocks dependency install scripts by default; allow one only via
  `onlyBuiltDependencies` in `pnpm-workspace.yaml` after reviewing what it runs.
