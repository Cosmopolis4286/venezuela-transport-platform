# VPS deployment preparation

> **Nothing is deployed.** This is the plan and checklist for a first Linux VPS deployment of
> the API and web app. Production Dockerfiles/Compose are not written yet; create them under
> `infrastructure/docker/production/` when deployment work starts. Do not reuse the
> development `docker-compose.yml`.

## Target topology (single VPS, low cost)

```
Internet ──443──▶ Caddy (or Nginx + certbot)  ── TLS termination, HTTP→HTTPS, security headers
                      ├── app.example.ve  ──▶ web  (Next.js, `next start`, 127.0.0.1:3000)
                      └── api.example.ve  ──▶ api  (NestJS, 127.0.0.1:4000)
                                                 └──▶ PostgreSQL 18 + PostGIS (localhost / Docker network only)
```

A 2 vCPU / 4 GB RAM VPS (Ubuntu 24.04 LTS) is enough to start. Managed PostgreSQL is a valid
alternative if backups and PostGIS are supported.

## 1. Server baseline

- [ ] Create a non-root sudo user; disable password and root SSH login (`PermitRootLogin no`,
      `PasswordAuthentication no`); use SSH keys only.
- [ ] `ufw default deny incoming`; allow `22/tcp` (or a custom SSH port), `80/tcp`, `443/tcp` only.
- [ ] `unattended-upgrades` for security patches; `fail2ban` for SSH.
- [ ] Install Docker Engine + Compose plugin. Never publish the database port to the internet;
      Docker's port publishing bypasses `ufw`, so bind to `127.0.0.1` or use an internal network.
- [ ] Set the server time zone to UTC (store `timestamptz`; display in `America/Caracas`).

## 2. HTTPS and reverse proxy

- [ ] DNS A/AAAA records for the web and API hostnames.
- [ ] Caddy obtains and renews Let's Encrypt certificates automatically (or Nginx + certbot).
- [ ] Forward `X-Forwarded-For`/`X-Forwarded-Proto` and set `API_TRUST_PROXY_HOPS=1` so rate
      limiting sees real client IPs (otherwise every request appears to come from the proxy).
- [ ] Add HSTS, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, and a CSP for the web app.
- [ ] Limit request body size (e.g. 1 MB) and enable gzip/zstd at the proxy.

## 3. Secrets and configuration

- [ ] Production variables are supplied as real environment variables (Compose `env_file:`
      with a root-owned `chmod 600` file outside the repo, or GitHub Environments secrets
      injected by the deploy job). The API ignores `.env` files when `NODE_ENV=production`.
- [ ] `NODE_ENV=production`, `API_HOST=0.0.0.0` (inside the container), explicit `CORS_ORIGINS`
      (`https://app.example.ve`), `SWAGGER_ENABLED=false` unless deliberately public,
      `APP_VERSION=<git sha>`.
- [ ] Unique, strong `DATABASE_PASSWORD` (the API rejects weak/placeholder ones in production).
      Use a dedicated app role with least privilege, separate from the migration/owner role.
- [ ] `NEXT_PUBLIC_API_BASE_URL` is set at **build** time for the web image.
- [ ] Rotate any secret that was ever pasted into chat, a ticket or a log.

## 4. Build and release

- [ ] CI builds images tagged with the git SHA after the CI workflow is green on `main`.
- [ ] Multi-stage Dockerfiles: `pnpm deploy --filter @vtp/api --prod` for a pruned API
      runtime; Next.js `output: 'standalone'` for the web image. Run as a non-root user.
- [ ] Push to a registry (GitHub Container Registry is free for private repos within limits).
- [ ] Deploy = pull new images → run migrations → restart services → health check.

## 5. Database migrations

- [ ] Migrations run as a **separate one-off step** before starting the new API version
      (e.g. `docker compose run --rm api pnpm db:migrate`), never automatically on API boot.
- [ ] Backwards-compatible migrations only (expand → deploy → contract) so the previous API
      version keeps working during and after the migration, which keeps rollback possible.

## 6. Backups

- [ ] Nightly `pg_dump -Fc` to a different provider/bucket (encrypted, e.g. with `age`),
      retention 7 daily + 4 weekly + 6 monthly. Consider WAL archiving (pgBackRest/WAL-G)
      when data loss tolerance drops below 24 h.
- [ ] Monthly **restore test** into a scratch database; a backup that was never restored is
      not a backup.
- [ ] Back up the reverse-proxy config and the production env file (encrypted) as well.

## 7. Health checks and monitoring

- [ ] Container/orchestrator health check on `GET /api/v1/health`; load balancer / deploy gate
      on `GET /api/v1/health/ready` (503 while the database is unreachable).
- [ ] Free uptime monitoring (e.g. Uptime Kuma self-hosted, or a free external pinger) on both
      endpoints and the web home page.
- [ ] Logs are JSON on stdout; rotate with Docker's `local` log driver (`max-size`, `max-file`).
      Logs must not contain secrets or passenger PII (the API redacts auth headers and omits
      query strings and bodies by default).

## 8. Rollback

- [ ] Keep the previous image tags. Rollback = redeploy the previous SHA; no rebuild needed.
- [ ] Because migrations are backwards compatible, the previous version runs against the new
      schema. If a migration must be undone, restore from backup is the last resort —
      document the decision in the incident notes.
- [ ] Write down the exact rollback command next to the deploy command and practise it once
      before the first real launch.
