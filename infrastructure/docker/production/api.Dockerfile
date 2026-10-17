# syntax=docker/dockerfile:1
# Production image for apps/api. Build from the repository root:
#   docker build -f infrastructure/docker/production/api.Dockerfile -t vtp-api .
ARG NODE_IMAGE=node:24.22.0-trixie-slim

FROM ${NODE_IMAGE} AS build
ENV CI=1 TURBO_TELEMETRY_DISABLED=1
RUN corepack enable
WORKDIR /repo
COPY . .
# Optional: behind a TLS-intercepting proxy, pass its CA without baking it into a layer:
#   docker build --secret id=ca_bundle,src=/path/to/ca.crt ...
RUN --mount=type=secret,id=ca_bundle \
    if [ -f /run/secrets/ca_bundle ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/ca_bundle; fi \
 && pnpm install --frozen-lockfile --filter @vtp/api...
RUN pnpm turbo run build --filter=@vtp/api
# Self-contained production node_modules (workspace packages copied, dev deps dropped).
RUN pnpm deploy --legacy --filter=@vtp/api --prod /out \
 && rm -rf /out/dist /out/drizzle \
 && cp -r apps/api/dist apps/api/drizzle /out/

FROM ${NODE_IMAGE} AS runtime
ENV NODE_ENV=production API_HOST=0.0.0.0 API_PORT=4000
WORKDIR /app
COPY --from=build --chown=node:node /out ./
USER node
EXPOSE 4000
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:'+(process.env.API_PORT||4000)+'/api/v1/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"]
# Migrations are a separate step: docker compose run --rm api node dist/database/migrate.js
CMD ["node", "--enable-source-maps", "dist/main.js"]
