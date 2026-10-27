# Self-hosted CI runner (Windows + WSL 2)

`.github/workflows/self-hosted-ci.yml` runs the same four jobs as CircleCI (quality, API e2e on
PostGIS, mobile bundles, production images) on a **GitHub Actions runner installed on the
maintainer's own machine**. GitHub does not charge minutes for self-hosted runners, so checks keep
running when the cloud CI credits run out. See ADR-022.

How it behaves:

- The jobs run only while the machine is on and the runner is started. Otherwise they wait in the
  queue (up to 24 hours) and start when the runner comes back.
- The four jobs run one after another on one runner; a full run takes roughly 10–20 minutes.
- Pull requests from forks never run on it (the runner executes the pull request's code). Keep
  the repository **private** while using a self-hosted runner.

## Why WSL 2 and not Windows directly

The jobs run inside the same containers as CircleCI (`node:24.22.0-trixie`, and
`postgis/postgis:18-3.6` for the e2e tests). GitHub Actions only supports job containers and
service containers on **Linux** runners, so the runner is installed inside Ubuntu on WSL 2, using
the Docker Desktop you already have.

## 1. Prepare Ubuntu on WSL 2 (once)

1. In PowerShell **as administrator**: `wsl --install -d Ubuntu-24.04`, restart if asked, and
   create the Ubuntu user when the window opens.
2. Docker Desktop → _Settings → Resources → WSL integration_: turn on **Ubuntu-24.04**, then
   _Apply & restart_.
3. Open Ubuntu (Start menu → "Ubuntu 24.04") and check Docker: `docker run --rm hello-world`.
4. Optional, so the runner can start by itself: enable systemd in Ubuntu.

   ```bash
   printf '[boot]\nsystemd=true\n' | sudo tee /etc/wsl.conf
   ```

   Then in PowerShell: `wsl --shutdown`, and open Ubuntu again.

5. Optional, if builds run out of memory: create `C:\Users\<you>\.wslconfig` with

   ```ini
   [wsl2]
   memory=8GB
   ```

   and run `wsl --shutdown`.

## 2. Register the runner (once)

1. On GitHub: repository → _Settings → Actions → Runners → New self-hosted runner_. Choose
   **Linux** and **x64**. The page shows the commands with a **registration token**: it is
   personal and expires within an hour. Do not paste it anywhere else.
2. In Ubuntu, run the _Download_ commands from that page (they create `~/actions-runner`).
3. Run the _Configure_ command from that page, adding the `vtp` label, for example:

   ```bash
   ./config.sh --url https://github.com/Cosmopolis4286/venezuela-transport-platform \
     --token <token from the page> --name vtp-pc --labels vtp --work _work --unattended
   ```

   The workflow only runs on runners with the labels `self-hosted`, `linux` and `vtp`.

## 3. Start it

- **When you want checks:** `cd ~/actions-runner && ./run.sh` (stop with Ctrl+C).
- **Always on while Ubuntu runs** (needs systemd, step 1.4):
  `cd ~/actions-runner && sudo ./svc.sh install && sudo ./svc.sh start`.

Repository → _Settings → Actions → Runners_ shows it as **Idle** when it is ready.

## 4. Require its checks (optional)

_Settings → Branches_ (rule for `main`) → _Require status checks to pass_ and pick the jobs of
**CI (self-hosted)**: `Lint, typecheck, test, build`, `API e2e (PostgreSQL + PostGIS)`,
`Mobile bundles (Android + iOS JS)` and `Production images`. While the CircleCI credits are out,
do not require the `ci/circleci: …` checks, or no pull request can be merged.

## Maintenance

- Update: the runner updates itself. Docker images used by the jobs are pulled when missing.
- Disk: the pnpm store lives in the Docker volume `vtp-ci-pnpm-store`; the images job removes
  the images it builds. To free space: `docker system prune` (and
  `docker volume rm vtp-ci-pnpm-store`, which only slows down the next install).
- Remove the runner: on GitHub _Runners → … → Remove_ gives a removal token, then in Ubuntu
  `sudo ./svc.sh uninstall` (if installed) and `./config.sh remove --token <token>`.

## Troubleshooting

| Symptom                                             | Fix                                                                                                        |
| --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Jobs stay "Queued"                                  | The runner is off or lacks the `vtp` label. Start `./run.sh`; check the labels in _Settings → Runners_.    |
| `docker: permission denied` / `Cannot connect`      | Docker Desktop is closed, or WSL integration is off for this Ubuntu (step 1.2).                            |
| `Container operations are only supported on Linux`  | The runner was installed on Windows instead of inside Ubuntu. Install it in WSL.                           |
| Next run fails cleaning the workspace (permissions) | A job was cancelled before giving files back. `sudo chown -R $USER ~/actions-runner/_work` once.           |
| Jobs don't start and GitHub mentions billing        | A billing lock (for example a failed payment) can block Actions entirely, even self-hosted. See _Billing_. |
