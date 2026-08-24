#!/usr/bin/env bash

set -euo pipefail
umask 077

readonly object_key="${1:-}"
if [[ ! "$object_key" =~ ^backups/postgres/[A-Za-z0-9._-]+\.dump\.enc$ ]]; then
  echo "Provide a safe review backup object key." >&2
  exit 2
fi

readonly root=/srv/jingtang/review
readonly service_uid=65532
readonly workdir="$root/backup-work/restore-$(date -u +%Y%m%dT%H%M%SZ)-$$"
readonly container="jingtang-review-restore-$$"
readonly postgres_image="postgres:17.6-alpine@sha256:ef257d85f76e48da1c64832459b59fcaba1a4dac97bf5d7450c77753542eee94"

cleanup() {
  docker rm -f "$container" >/dev/null 2>&1 || true
  rm -rf -- "$workdir"
}
trap cleanup EXIT
install -d -m 0700 -o "$service_uid" -g "$service_uid" "$workdir"

compose() {
  docker compose --project-directory "$root" \
    --env-file "$root/runtime.env" --env-file "$root/release.env" \
    -f "$root/compose.yaml" "$@"
}

REVIEW_BACKUP_WORKDIR="$workdir" compose --profile tools run --rm \
  -e REVIEW_BACKUP_INPUT=/work/database.dump.enc \
  -e REVIEW_BACKUP_OUTPUT=/work/database.dump \
  -e REVIEW_BACKUP_OBJECT_KEY="$object_key" \
  backup-tool node apps/platform/scripts/review-storage-tool.mjs download

printf '%s\n' "$(openssl rand -hex 24)" > "$workdir/postgres-password"
chown 70:70 "$workdir/postgres-password" "$workdir/database.dump"
chmod 0400 "$workdir/postgres-password" "$workdir/database.dump"
install -d -m 0700 -o 70 -g 70 "$workdir/postgres-data"

docker run -d --name "$container" --network none \
  -e POSTGRES_PASSWORD_FILE=/run/secrets/postgres-password \
  -v "$workdir/postgres-password:/run/secrets/postgres-password:ro" \
  -v "$workdir/database.dump:/restore/database.dump:ro" \
  -v "$workdir/postgres-data:/var/lib/postgresql/data" \
  "$postgres_image" >/dev/null

ready_count=0
for _ in {1..60}; do
  if docker inspect -f '{{.State.Running}}' "$container" 2>/dev/null | grep -qx true \
    && docker exec "$container" psql -U postgres -d postgres -Atc "SELECT 1" \
      2>/dev/null | grep -qx 1; then
    ((ready_count += 1))
    if (( ready_count >= 2 )); then
      break
    fi
  else
    ready_count=0
  fi
  sleep 1
done
if (( ready_count < 2 )); then
  docker logs "$container" >&2 || true
  echo "Isolated restore database did not become stably ready." >&2
  exit 3
fi
docker exec "$container" psql -U postgres -d postgres --set=ON_ERROR_STOP=1 \
  -c "CREATE ROLE jingtang_app NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION"
docker exec "$container" psql -U postgres -d postgres --set=ON_ERROR_STOP=1 \
  -c "CREATE ROLE jingtang_worker NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION"
docker exec "$container" createdb -U postgres restore_drill
docker exec "$container" pg_restore -U postgres -d restore_drill --no-owner --no-privileges /restore/database.dump
table_count="$(docker exec "$container" psql -U postgres -d restore_drill -Atc "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public'")"
if [[ ! "$table_count" =~ ^[0-9]+$ ]] || (( table_count < 1 )); then
  echo "Isolated restore did not produce the expected schema." >&2
  exit 4
fi
echo "Isolated restore drill passed ($table_count public tables)."
