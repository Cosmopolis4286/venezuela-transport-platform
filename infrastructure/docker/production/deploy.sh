#!/usr/bin/env bash
set -Eeuo pipefail

# Run from any directory. Secrets stay in files outside the repository.
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE_FILE="${VTP_COMPOSE_FILE:-$ROOT_DIR/compose.yml}"
COMPOSE_ENV_FILE="${VTP_COMPOSE_ENV_FILE:-/etc/vtp/compose.env}"
API_ENV_FILE="${VTP_API_ENV_FILE:-/etc/vtp/api.env}"
POSTGRES_ENV_FILE="${VTP_POSTGRES_ENV_FILE:-/etc/vtp/postgres.env}"

for file in "$COMPOSE_ENV_FILE" "$API_ENV_FILE" "$POSTGRES_ENV_FILE"; do
  if [[ ! -f "$file" ]]; then
    echo "Falta el archivo de configuración: $file" >&2
    exit 1
  fi
done

compose() {
  docker compose -f "$COMPOSE_FILE" --env-file "$COMPOSE_ENV_FILE" "$@"
}

echo "==> Validando configuración resuelta"
compose config --quiet

echo "==> Descargando imágenes fijadas por SHA"
compose pull api web migrate

echo "==> Aplicando migraciones antes de actualizar la API"
compose run --rm migrate

echo "==> Actualizando servicios"
compose up -d --remove-orphans --wait

API_DOMAIN="$(sed -n 's/^VTP_API_DOMAIN=//p' "$COMPOSE_ENV_FILE" | tail -n 1)"
WEB_DOMAIN="$(sed -n 's/^VTP_WEB_DOMAIN=//p' "$COMPOSE_ENV_FILE" | tail -n 1)"
if [[ -z "$API_DOMAIN" || -z "$WEB_DOMAIN" ]]; then
  echo "VTP_API_DOMAIN y VTP_WEB_DOMAIN son obligatorios." >&2
  exit 1
fi

echo "==> Verificando endpoints públicos"
curl --fail --silent --show-error --retry 10 --retry-delay 3 "https://$API_DOMAIN/api/v1/health/ready" >/dev/null
curl --fail --silent --show-error --retry 10 --retry-delay 3 "https://$WEB_DOMAIN/es" >/dev/null

echo "Despliegue completado. Imágenes:"
compose images
