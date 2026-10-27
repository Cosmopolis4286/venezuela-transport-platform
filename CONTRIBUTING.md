# Contributing

1. Read the [README](README.md) and set up your machine with
   [docs/development/local-setup.md](docs/development/local-setup.md).
2. Create a branch from `main` (`feat/...`, `fix/...`, `chore/...`) — see
   [repository workflow](docs/development/repository-workflow.md).
3. Make focused changes. Follow the module and contract rules in
   [architecture overview](docs/architecture/overview.md).
4. Before pushing: `pnpm format && pnpm check` (and `pnpm build` when touching build config).
   When behaviour changes, add a line under **Unreleased** in [CHANGELOG.md](CHANGELOG.md) and
   update [docs/roadmap.md](docs/roadmap.md) if a feature moves from pending to done.
5. Commit with [Conventional Commits](https://www.conventionalcommits.org/):
   `feat(api): add terminals module`.
6. Open a pull request using the template. CI must be green before merging.

## Ground rules

- Never commit `.env` files, credentials, certificates, real passenger data or production dumps.
- Add every new environment variable to the matching `.env.example` and to
  [environment-variables.md](docs/development/environment-variables.md).
- Mobile-exposed (`EXPO_PUBLIC_*`) and browser-exposed (`NEXT_PUBLIC_*`) variables are public.
- Do not share UI components between web and mobile apps; share contracts via
  `@vtp/shared-types` only.
- Add mobile dependencies with `npx expo install <pkg>` inside the app folder so versions match
  the Expo SDK.
- New dependencies need a reason in the PR description.
