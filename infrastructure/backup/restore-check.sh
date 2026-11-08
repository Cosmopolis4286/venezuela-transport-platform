#!/usr/bin/env bash
# Proves a backup can be restored: decrypts it, loads it into a throwaway PostGIS container and
# checks the main tables. Run it monthly on a trusted machine that holds the age PRIVATE key
# (never on the production server). Nothing touches the production database.
#
#   ./restore-check.sh vtp-db-20261108T030000Z.dump.age ~/.config/vtp/backup-key.txt \
#     [vtp-uploads-20261108T030000Z.tar.age]
set -euo pipefail

usage='Usage: restore-check.sh <db.dump.age> <age-identity-file> [uploads.tar.age]'
BACKUP=${1:?$usage}
IDENTITY=${2:?$usage}
UPLOADS=${3:-}
IMAGE=${VTP_RESTORE_IMAGE:-postgis/postgis:18-3.6}
name=vtp-restore-check-$$
work=$(mktemp -d)
cleanup() {
  docker rm -f "$name" >/dev/null 2>&1 || true
  rm -rf "$work"
}
trap cleanup EXIT

age -d -i "$IDENTITY" -o "$work/db.dump" "$BACKUP"
docker run -d --name "$name" -e POSTGRES_PASSWORD=restore-check -e POSTGRES_DB=restore \
  "$IMAGE" >/dev/null
# The image starts a temporary server (Unix socket only) to initialize, then restarts: wait for
# the final one, which listens on TCP.
for _ in $(seq 1 90); do
  docker exec "$name" pg_isready -h 127.0.0.1 -U postgres -d restore >/dev/null 2>&1 && break
  sleep 1
done
docker cp "$work/db.dump" "$name:/tmp/db.dump"
docker exec "$name" pg_restore -h 127.0.0.1 -U postgres -d restore --no-owner --no-privileges \
  --exit-on-error /tmp/db.dump

count() {
  docker exec "$name" psql -h 127.0.0.1 -U postgres -d restore -tAc "select count(*) from $1"
}
echo "Restored $(basename "$BACKUP"):"
for table in users organizations bookings payments __drizzle_migrations; do
  table_ref=$table
  [ "$table" = __drizzle_migrations ] && table_ref=drizzle.__drizzle_migrations
  printf '  %-22s %s\n' "$table" "$(count "$table_ref")"
done
[ "$(count drizzle.__drizzle_migrations)" -gt 0 ] || {
  echo 'No migrations in the restored database: the backup is not usable.' >&2
  exit 1
}
if [ -n "$UPLOADS" ]; then
  files=$(age -d -i "$IDENTITY" "$UPLOADS" | tar -tf - | grep -vc '/$' || true)
  echo "  KYC files in $(basename "$UPLOADS"): $files"
fi
echo 'Restore check OK.'
