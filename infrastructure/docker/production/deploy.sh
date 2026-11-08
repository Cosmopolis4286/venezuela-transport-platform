#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE_FILE="${VTP_COMPOSE_FILE:-$ROOT_DIR/compose.yml}"
COMPOSE_ENV_FILE="${VTP_COMPOSE_ENV_FILE:-/etc/vtp/compose.env}"

if [[ ! -f "$COMPOSE_FILE" ]]; then
  echo "No existe el Compose de producción: $COMPOSE_FILE" >&2
  exit 1
fi
if [[ ! -f "$COMPOSE_ENV_FILE" ]]; then
  echo "No existe el archivo de entorno: $COMPOSE_ENV_FILE" >&2
  exit 1
fi

# The env file is root-owned and chmod 600 on the production host.
set -a
# shellcheck disable=SC1090
source "$COMPOSE_ENV_FILE"
set +a

: "${VTP_WEB_DOMAIN:?Define VTP_WEB_DOMAIN en $COMPOSE_ENV_FILE}"
: "${VTP_API_DOMAIN:?Define VTP_API_DOMAIN en $COMPOSE_ENV_FILE}"
: "${VTP_API_IMAGE:?Define VTP_API_IMAGE en $COMPOSE_ENV_FILE}"
: "${VTP_WEB_IMAGE:?Define VTP_WEB_IMAGE en $COMPOSE_ENV_FILE}"

COMPOSE=(docker compose --env-file "$COMPOSE_ENV_FILE" -f "$COMPOSE_FILE")
compose() {
  "${COMPOSE[@]}" "$@"
}

echo "==> Validando configuración de producción"
compose --profile migrate config --quiet

echo "==> Descargando imágenes"
compose pull

echo "==> Ejecutando migraciones con el usuario propietario"
compose --profile migrate run --rm migrate

echo "==> Actualizando servicios"
compose up -d --remove-orphans --wait --wait-timeout 180 postgres api web caddy

wait_for_url() {
  local url="$1"
  local description="$2"
  local attempt

  for attempt in $(seq 1 30); do
    if curl --fail --silent --show-error --max-time 10 "$url" >/dev/null; then
      echo "OK: $description"
      return 0
    fi
    sleep 5
  done

  echo "No respondió $description: $url" >&2
  return 1
}

echo "==> Comprobando endpoints HTTPS"
wait_for_url "https://$VTP_API_DOMAIN/api/v1/health/ready" "API"
wait_for_url "https://$VTP_WEB_DOMAIN/es" "web"

echo "Despliegue completado. Imágenes: $VTP_API_IMAGE / $VTP_WEB_IMAGE"
