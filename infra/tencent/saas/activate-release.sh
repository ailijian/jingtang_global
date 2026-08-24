#!/usr/bin/env bash

set -euo pipefail

readonly saas_root="/srv/jingtang/saas"
readonly release_id="${1:-}"
readonly app_archive_sha256="${2:-}"
readonly caddy_archive_sha256="${3:-}"
readonly change_reference="${4:-}"
readonly release_dir="$saas_root/releases/$release_id"
readonly app_archive="$release_dir/jingtang-saas.tar.gz"
readonly caddy_archive="$release_dir/jingtang-caddy.tar.gz"
readonly candidate_compose="$release_dir/compose.yaml"
readonly candidate_caddyfile="$release_dir/Caddyfile"
readonly candidate_release_env="$release_dir/release.env"
readonly rollback_dir="$release_dir/rollback-$(date -u +%Y%m%dT%H%M%SZ)-$$"

if [[ ! "$release_id" =~ ^[0-9a-f]{40}$ ]]; then
  echo "Release id must be a full lowercase Git SHA." >&2
  exit 2
fi
if [[ ! "$app_archive_sha256" =~ ^[0-9a-f]{64}$ ]] \
  || [[ ! "$caddy_archive_sha256" =~ ^[0-9a-f]{64}$ ]]; then
  echo "Both image archive checksums must be SHA-256." >&2
  exit 2
fi
if [[ ! "$change_reference" =~ ^[A-Za-z0-9._:/-]{3,128}$ ]]; then
  echo "A safe production change reference is required." >&2
  exit 2
fi
for archive_check in \
  "$app_archive_sha256  $app_archive" \
  "$caddy_archive_sha256  $caddy_archive"; do
  if ! echo "$archive_check" | sha256sum --check --status; then
    echo "A release archive is missing or failed checksum validation." >&2
    exit 3
  fi
done
for candidate in "$candidate_compose" "$candidate_caddyfile"; do
  if [[ ! -f "$candidate" ]]; then
    echo "Release configuration is incomplete: $candidate" >&2
    exit 3
  fi
done
if [[ ! -f "$saas_root/runtime.env" ]] || [[ "$(stat -c '%a' "$saas_root/runtime.env")" != "600" ]]; then
  echo "Protected non-secret runtime bootstrap file must exist with mode 0600." >&2
  exit 4
fi
if grep -Eq '^(DATABASE_(ADMIN_)?URL|DATABASE_WORKER_URL|CIAM_CLIENT_SECRET|SESSION_COOKIE_SECRET|TDMQ_AMQP_URL|YOUTUBE_OAUTH_CLIENT_SECRET|YOUTUBE_OAUTH_STATE_SECRET|TENCENT_CLOUD_SECRET_(ID|KEY))=' "$saas_root/runtime.env"; then
  echo "Plaintext secrets are forbidden in runtime.env." >&2
  exit 5
fi

docker load --input "$app_archive" >/dev/null
docker load --input "$caddy_archive" >/dev/null
readonly image="jingtang-saas:$release_id"
readonly caddy_image="jingtang-caddy:$release_id"
for candidate_image in "$image" "$caddy_image"; do
  if [[ "$(docker image inspect --format '{{index .Config.Labels "org.opencontainers.image.revision"}}' "$candidate_image")" != "$release_id" ]]; then
    echo "Loaded image revision does not match the approved release: $candidate_image" >&2
    exit 6
  fi
done

printf 'JINGTANG_IMAGE=%s\nJINGTANG_CADDY_IMAGE=%s\n' \
  "$image" "$caddy_image" > "$candidate_release_env"
chmod 0600 "$candidate_release_env"

compose_candidate() {
  docker compose --project-directory "$saas_root" \
    --env-file "$saas_root/runtime.env" \
    --env-file "$candidate_release_env" \
    -f "$candidate_compose" "$@"
}

compose_live() {
  docker compose --project-directory "$saas_root" \
    --env-file "$saas_root/runtime.env" \
    --env-file "$saas_root/release.env" \
    -f "$saas_root/compose.yaml" "$@"
}

# Validate the complete candidate before replacing any live release files.
compose_candidate config --quiet
docker run --rm --network none \
  --volume "$candidate_caddyfile:/etc/caddy/Caddyfile:ro" \
  "$caddy_image" validate --config /etc/caddy/Caddyfile --adapter caddyfile >/dev/null

readonly previous_release="$(cat "$saas_root/current-release" 2>/dev/null || true)"
install -d -m 0700 "$rollback_dir"
for live_file in compose.yaml Caddyfile release.env current-release; do
  if [[ -f "$saas_root/$live_file" ]]; then
    cp -p "$saas_root/$live_file" "$rollback_dir/$live_file"
  fi
done

rollback_started="false"
rollback() {
  if [[ "$rollback_started" == "true" ]]; then
    return
  fi
  rollback_started="true"
  set +e

  if [[ -f "$saas_root/compose.yaml" ]] && [[ -f "$saas_root/release.env" ]]; then
    compose_live down --remove-orphans >/dev/null 2>&1
  fi

  for live_file in compose.yaml Caddyfile release.env current-release; do
    if [[ -f "$rollback_dir/$live_file" ]]; then
      cp -p "$rollback_dir/$live_file" "$saas_root/$live_file"
    else
      rm -f "$saas_root/$live_file"
    fi
  done

  if [[ "$previous_release" =~ ^[0-9a-f]{40}$ ]] \
    && [[ -f "$saas_root/compose.yaml" ]] \
    && [[ -f "$saas_root/release.env" ]]; then
    compose_live up -d --remove-orphans >/dev/null 2>&1
  fi
  set -e
}

on_error() {
  readonly status=$?
  trap - ERR
  rollback
  echo "Release activation failed; the previous complete release configuration was restored." >&2
  exit "$status"
}
trap on_error ERR

install -m 0644 "$candidate_compose" "$saas_root/compose.yaml.next"
install -m 0644 "$candidate_caddyfile" "$saas_root/Caddyfile.next"
install -m 0600 "$candidate_release_env" "$saas_root/release.env.next"
mv "$saas_root/compose.yaml.next" "$saas_root/compose.yaml"
mv "$saas_root/Caddyfile.next" "$saas_root/Caddyfile"
mv "$saas_root/release.env.next" "$saas_root/release.env"

compose_live up -d --remove-orphans

for _ in {1..30}; do
  platform_state="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' jingtang-saas-platform-1 2>/dev/null || true)"
  ingress_state="$(docker inspect --format '{{.State.Status}}' jingtang-saas-ingress-1 2>/dev/null || true)"
  dispatcher_state="$(docker inspect --format '{{.State.Status}}' jingtang-saas-dispatcher-1 2>/dev/null || true)"
  worker_state="$(docker inspect --format '{{.State.Status}}' jingtang-saas-worker-1 2>/dev/null || true)"
  if [[ "$platform_state" == "healthy" ]] \
    && [[ "$ingress_state" == "running" ]] \
    && [[ "$dispatcher_state" == "running" ]] \
    && [[ "$worker_state" == "running" ]]; then
    printf '%s\n' "$release_id" > "$saas_root/current-release.next"
    mv "$saas_root/current-release.next" "$saas_root/current-release"
    printf '%s %s %s\n' "$(date -u +%FT%TZ)" "$release_id" "$change_reference" >> "$saas_root/change-record.log"
    trap - ERR
    compose_live ps
    exit 0
  fi
  sleep 5
done

echo "The release did not become ready (platform=$platform_state ingress=$ingress_state dispatcher=$dispatcher_state worker=$worker_state); check the D7 migration and runtime secret versions." >&2
false
