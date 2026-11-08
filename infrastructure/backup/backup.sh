#!/usr/bin/env bash
# Nightly backup of the production database and the KYC uploads, encrypted with age.
# Runs on the VPS (cron/systemd timer, see docs/deployment/backups.md). Only the age PUBLIC key
# lives on the server: a stolen backup or server cannot be decrypted without the private key,
# which is kept offline.
#
#   VTP_BACKUP_RECIPIENTS=/etc/vtp/backup-recipients.txt \
#   VTP_BACKUP_DIR=/var/backups/vtp ./backup.sh
#
# Optional: VTP_BACKUP_RCLONE_REMOTE=remote:bucket/vtp copies the files to another provider.
set -euo pipefail
umask 077

COMPOSE=${VTP_COMPOSE:-docker compose -f /opt/vtp/compose.yml --env-file /etc/vtp/compose.env}
RECIPIENTS=${VTP_BACKUP_RECIPIENTS:?Set VTP_BACKUP_RECIPIENTS to the age public key file}
DIR=${VTP_BACKUP_DIR:-/var/backups/vtp}
UPLOADS=${VTP_BACKUP_UPLOADS:-1}
REMOTE=${VTP_BACKUP_RCLONE_REMOTE:-}

# Daily copies; Sunday's also kept as weekly and the 1st of the month as monthly.
stamp=$(date -u +%Y%m%dT%H%M%SZ)
kinds=(daily)
[ "$(date -u +%u)" = 7 ] && kinds+=(weekly)
[ "$(date -u +%d)" = 01 ] && kinds+=(monthly)
mkdir -p "$DIR"/{daily,weekly,monthly}

db="$DIR/daily/vtp-db-$stamp.dump.age"
# shellcheck disable=SC2016 # expanded inside the container
$COMPOSE exec -T postgres sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' |
  age -R "$RECIPIENTS" -o "$db.partial"
mv "$db.partial" "$db"
files=("$db")

if [ "$UPLOADS" = 1 ]; then
  up="$DIR/daily/vtp-uploads-$stamp.tar.age"
  $COMPOSE exec -T api tar -C /app/var/uploads -cf - . | age -R "$RECIPIENTS" -o "$up.partial"
  mv "$up.partial" "$up"
  files+=("$up")
fi

for kind in "${kinds[@]:1}"; do
  for f in "${files[@]}"; do cp "$f" "$DIR/$kind/"; done
done

# Retention: 7 daily, 4 weekly, 6 monthly (two files per backup when uploads are included).
per=${#files[@]}
prune() {
  ls -1t "$DIR/$1"/vtp-*.age 2>/dev/null | tail -n +$(($2 * per + 1)) | xargs -r rm -f --
}
prune daily 7
prune weekly 4
prune monthly 6

if [ -n "$REMOTE" ]; then
  rclone sync "$DIR" "$REMOTE"
fi

echo "Backup OK: ${files[*]}"
