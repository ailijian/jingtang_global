#!/usr/bin/env bash

set -euo pipefail
umask 077

readonly root=/srv/jingtang/review
readonly service_uid=65532
readonly timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
readonly workdir="$root/backup-work/$timestamp-$$"
readonly object_key="backups/postgres/review-$timestamp.dump.enc"
readonly compose_file="$root/compose.yaml"

cleanup() {
  rm -rf -- "$workdir"
}
trap cleanup EXIT
install -d -m 0700 -o "$service_uid" -g "$service_uid" "$workdir"

compose() {
  docker compose --project-directory "$root" \
    --env-file "$root/runtime.env" --env-file "$root/release.env" \
    -f "$compose_file" "$@"
}

compose exec -T -u postgres postgres \
  pg_dump -U postgres -d jingtang -Fc --no-owner --no-privileges > "$workdir/database.dump"
chown "$service_uid:$service_uid" "$workdir/database.dump"
chmod 0600 "$workdir/database.dump"

REVIEW_BACKUP_WORKDIR="$workdir" compose --profile tools run --rm \
  -e REVIEW_BACKUP_INPUT=/work/database.dump \
  -e REVIEW_BACKUP_OUTPUT=/work/database.dump.enc \
  -e REVIEW_BACKUP_OBJECT_KEY="$object_key" \
  backup-tool

echo "Encrypted review backup uploaded: $object_key"
