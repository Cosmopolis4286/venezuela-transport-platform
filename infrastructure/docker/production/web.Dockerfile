# syntax=docker/dockerfile:1
# Production image for apps/web (Next.js standalone output). Build from the repository root:
#   docker build -f infrastructure/docker/production/web.Dockerfile \
#     --build-arg NEXT_PUBLIC_API_BASE_URL=https://api.example.ve/api/v1 -t vtp-web .
ARG NODE_IMAGE=node:24.22.0-trixie-slim

FROM ${NODE_IMAGE} AS build
# Public, build-time configuration: it is inlined into the browser bundle. Never a secret.
ARG NEXT_PUBLIC_API_BASE_URL
ENV CI=1 NEXT_TELEMETRY_DISABLED=1 TURBO_TELEMETRY_DISABLED=1 NEXT_OUTPUT=standalone \
    NEXT_PUBLIC_API_BASE_URL=${NEXT_PUBLIC_API_BASE_URL}
RUN corepack enable
WORKDIR /repo
COPY . .
# Optional: behind a TLS-intercepting proxy, pass its CA without baking it into a layer:
#   docker build --secret id=ca_bundle,src=/path/to/ca.crt ...
RUN --mount=type=secret,id=ca_bundle \
    if [ -f /run/secrets/ca_bundle ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/ca_bundle; fi \
 && pnpm install --frozen-lockfile --filter @vtp/web...
RUN pnpm turbo run build --filter=@vtp/web

FROM ${NODE_IMAGE} AS runtime
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 HOSTNAME=0.0.0.0 PORT=3000
WORKDIR /app
COPY --from=build --chown=node:node /repo/apps/web/.next/standalone ./
COPY --from=build --chown=node:node /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=build --chown=node:node /repo/apps/web/public ./apps/web/public
USER node
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"]
CMD ["node", "apps/web/server.js"]
