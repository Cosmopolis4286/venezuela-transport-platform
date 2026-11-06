#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE_FILE="${VTP_COMPOSE_FILE:-$ROOT_DIR/compose.yml}"
COMPOSE_ENV_FILE="${VTP_COMPOSE_ENV_FILE:-/etc/vtp/compose.env}"
BACKUP_DIR="${VTP_BACKUP_DIR:-/var/backups/vtp}"
AGE_RECIPIENT="${VTP_BACKUP_AGE_RECIPIENT:-}"

if [[ -z "$AGE_RECIPIENT" ]]; then
  echo "Define VTP_BACKUP_AGE_RECIPIENT (clave pública age) antes de continuar." >&2
  exit 1
fi
if ! command -v age >/dev/null 2>&1; then
  echo "Instala age en el servidor antes de ejecutar el backup." >&2
  exit 1
fi
if [[ ! -f "$COMPOSE_ENV_FILE" ]]; then
  echo "No existe $COMPOSE_ENV_FILE" >&2
  exit 1
fi

mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
WORK_DIR="$(mktemp -d "$BACKUP_DIR/.vtp-backup.XXXXXX")"
trap 'rm -rf "$WORK_DIR"' EXIT

compose() {
  docker compose -f "$COMPOSE_FILE" --env-file "$COMPOSE_ENV_FILE" "$@"
}

echo "==> Exportando PostgreSQL"
compose exec -T postgres sh -ec 'pg_dump -Fc -U "$POSTGRES_USER" "$POSTGRES_DB"' > "$WORK_DIR/database.dump"

echo "==> Exportando documentos KYC"
compose exec -T api tar -C /app/var -czf - uploads > "$WORK_DIR/uploads.tar.gz"

echo "==> Empaquetando y cifrando"
tar -C "$WORK_DIR" -czf - database.dump uploads.tar.gz |
  age -r "$AGE_RECIPIENT" -o "$BACKUP_DIR/vtp-$STAMP.tar.gz.age"

chmod 600 "$BACKUP_DIR/vtp-$STAMP.tar.gz.age"
sha256sum "$BACKUP_DIR/vtp-$STAMP.tar.gz.age" > "$BACKUP_DIR/vtp-$STAMP.tar.gz.age.sha256"
chmod 600 "$BACKUP_DIR/vtp-$STAMP.tar.gz.age.sha256"

echo "Backup cifrado creado: $BACKUP_DIR/vtp-$STAMP.tar.gz.age"
echo "Copia ambos archivos a almacenamiento externo. No guardes la única copia en este VPS."
