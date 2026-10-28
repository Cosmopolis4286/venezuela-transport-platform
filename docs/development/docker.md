# Running the platform with Docker

`docker-compose.yml` (repository root) runs the platform locally in three ways. Pick by what you
are working on:

| Mode                   | In Docker                | On your machine            | Start                                   |
| ---------------------- | ------------------------ | -------------------------- | --------------------------------------- |
| **Local** (default)    | Database                 | API, website, mobile apps  | `pnpm infra:up`, then `pnpm dev`        |
| **Hybrid** (frontends) | Database + API           | Website and/or mobile apps | `pnpm stack:api`, then `pnpm dev:web` … |
| **Full Docker**        | Database + API + website | Mobile apps (Expo) only    | `pnpm stack:app`                        |

- **Local** is the usual flow for backend work: hot reload of the API ([local-setup.md](local-setup.md)).
- **Hybrid** is for frontend work: no API toolchain or migrations to run, the website and the
  apps reload as you edit them.
- **Full Docker** runs the **same images as production**, with development settings. Use it to
  try the whole platform or to check that the images work.

The mobile apps never run in Docker: they run on a phone, an emulator or the browser preview
([android-testing.md](android-testing.md)).

## Commands

| Task                                          | Command                         |
| --------------------------------------------- | ------------------------------- |
| Database only                                 | `pnpm infra:up`                 |
| Database + API (builds the API image)         | `pnpm stack:api`                |
| Database + API + website (builds both images) | `pnpm stack:app`                |
| Status                                        | `pnpm infra:ps`                 |
| Logs of the API and website                   | `pnpm stack:logs`               |
| Stop everything (data is kept)                | `pnpm stack:down`               |
| **Delete** local data                         | `pnpm infra:reset` (asks first) |

`pnpm stack:*` rebuilds the images when the code changed; the first build takes a few minutes.
Migrations run automatically (`migrate` service) before the API starts.

| URL                            | What               |
| ------------------------------ | ------------------ |
| http://localhost:3000          | Website and portal |
| http://localhost:4000/api/v1   | API                |
| http://localhost:4000/api/docs | Swagger UI         |

## Development settings inside Docker

The API container runs the production image with `NODE_ENV=development`, so:

- **One-time codes** are printed to its log: `docker compose logs api | grep "login code"` (or use
  e-mail + password).
- **Payments** use the simulated provider (the apps offer "Simular pago").
- Uploaded KYC documents are kept in the `api-uploads` volume.
- Logs are JSON (the pretty printer is a development dependency, not in the image).
- To grant yourself platform staff rights:
  `docker compose exec api node dist/cli/platform-grant.js --email you@example.com --role admin`
  — or run `pnpm platform:grant …` from your machine against the same database.

The website container is the production build: the browser calls the API at
`VTP_WEB_PUBLIC_API_BASE_URL` (default `http://localhost:4000/api/v1`) and the server side calls
it over the Compose network. Its session cookies are `Secure`, which browsers accept on
`http://localhost`; open it as `localhost`, not by IP.

## Hybrid mode step by step

```bash
pnpm stack:api                  # database + API in Docker, migrations applied
pnpm dev:web                    # website on http://localhost:3000 (hot reload)
pnpm dev:passenger              # and/or the passenger app (Metro on :8081)
pnpm dev:transport              # and/or the transport app (Metro on :8082)
```

Do **not** run `pnpm dev` or `pnpm dev:api` at the same time: they start a second API on port 4000. `apps/web/.env.local` keeps its default `NEXT_PUBLIC_API_BASE_URL=http://localhost:4000/api/v1`.

## Configuration

The root `.env` (created by `pnpm env:init`) feeds both the database and the containers. The
`VTP_*` variables are optional ([environment-variables.md](environment-variables.md)): ports, the
address the API is published on, and the API URL baked into the website image (rebuild with
`pnpm stack:app` after changing it). `apps/api/.env` is **not** used by the containers.

## Troubleshooting

| Symptom                                          | Fix                                                                                                            |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| `port is already allocated` (4000 or 3000)       | A local `pnpm dev` is running: stop it, or set `VTP_API_PORT` / `VTP_WEB_PORT` in `.env`.                      |
| `migrate` exits with an error                    | `docker compose logs migrate`. The database password in `.env` must match the one the volume was created with. |
| Website loads but sign-in loops back to `/login` | Open it as `http://localhost:3000`, not `127.0.0.1` or a LAN IP (secure cookies).                              |
| A phone cannot reach the API                     | Set `VTP_API_PUBLISH_ADDRESS=0.0.0.0`, run `pnpm stack:api` again, allow port 4000 in the firewall.            |
| Images do not pick up your changes               | `pnpm stack:app` rebuilds; force it with `docker compose --profile app build --no-cache`.                      |
