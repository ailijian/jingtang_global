#!/usr/bin/env bash

set -euo pipefail

readonly review_root=/srv/jingtang/review
readonly site_root=/srv/jingtang/public-site
readonly release_id="${1:-}"
readonly images_sha256="${2:-}"
readonly change_reference="${3:-}"
readonly release_dir="$review_root/releases/$release_id"
readonly images_archive="$release_dir/jingtang-review-images.tar"
readonly candidate_compose="$release_dir/compose.yaml"
readonly candidate_site_compose="$release_dir/public-site-compose.yaml"
readonly candidate_caddyfile="$release_dir/public-site-Caddyfile"
readonly candidate_release_env="$release_dir/release.env"
readonly candidate_init="$release_dir/init/001-create-roles.sh"
readonly rollback_dir="$release_dir/rollback-$(date -u +%Y%m%dT%H%M%SZ)-$$"

if [[ "${EUID:-$(id -u)}" -ne 0 ]]; then
  echo "Activate the review release as root." >&2
  exit 2
fi
if [[ ! "$release_id" =~ ^[0-9a-f]{40}$ ]] \
  || [[ ! "$images_sha256" =~ ^[0-9a-f]{64}$ ]]; then
  echo "Release id and archive checksums are invalid." >&2
  exit 2
fi
if [[ ! "$change_reference" =~ ^[A-Za-z0-9._:/-]{3,128}$ ]]; then
  echo "A safe review change reference is required." >&2
  exit 2
fi
echo "$images_sha256  $images_archive" | sha256sum --check --status || {
  echo "The review image archive is missing or failed checksum validation." >&2
  exit 3
}
for candidate in \
  "$candidate_compose" "$candidate_site_compose" "$candidate_caddyfile" "$candidate_init"; do
  [[ -f "$candidate" ]] || {
    echo "Review release configuration is incomplete: $candidate" >&2
    exit 3
  }
done
for protected in "$review_root/runtime.env" "$site_root/compose.yaml" "$site_root/Caddyfile"; do
  [[ -f "$protected" ]] || {
    echo "Required live configuration is missing: $protected" >&2
    exit 4
  }
done
if [[ "$(stat -c '%a' "$review_root/runtime.env")" != "600" ]]; then
  echo "Review runtime.env must use mode 0600." >&2
  exit 4
fi
if grep -Eq '(SECRET|PASSWORD|DATABASE_URL)=' "$review_root/runtime.env"; then
  echo "Plaintext secrets are forbidden in review runtime.env." >&2
  exit 5
fi

docker load --input "$images_archive" >/dev/null
readonly image="jingtang-review:$release_id"
readonly migration_image="jingtang-review-migration:$release_id"
for candidate_image in "$image" "$migration_image"; do
  if [[ "$(docker image inspect --format '{{index .Config.Labels "org.opencontainers.image.revision"}}' "$candidate_image")" != "$release_id" ]]; then
    echo "Loaded image revision does not match the review release: $candidate_image" >&2
    exit 6
  fi
done
printf 'JINGTANG_IMAGE=%s\nJINGTANG_MIGRATION_IMAGE=%s\n' \
  "$image" "$migration_image" > "$candidate_release_env"
chmod 0600 "$candidate_release_env"

compose_candidate() {
  docker compose --project-directory "$review_root" \
    --env-file "$review_root/runtime.env" --env-file "$candidate_release_env" \
    -f "$candidate_compose" "$@"
}
compose_live() {
  docker compose --project-directory "$review_root" \
    --env-file "$review_root/runtime.env" --env-file "$review_root/release.env" \
    -f "$review_root/compose.yaml" "$@"
}
site_live() {
  docker compose --project-directory "$site_root" -f "$site_root/compose.yaml" "$@"
}

docker network inspect jingtang-ingress >/dev/null 2>&1 || docker network create jingtang-ingress >/dev/null
compose_candidate config --quiet
docker run --rm --network none \
  -v "$candidate_caddyfile:/etc/caddy/Caddyfile:ro" \
  caddy:2.10.2-alpine@sha256:4c6e91c6ed0e2fa03efd5b44747b625fec79bc9cd06ac5235a779726618e530d \
  caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile >/dev/null

previous_review_running=false
if [[ "$(docker inspect --format '{{.State.Running}}' jingtang-review-platform-1 2>/dev/null || true)" == true ]]; then
  previous_review_running=true
fi

previous_release_id=""
if [[ -f "$review_root/current-release" ]]; then
  previous_release_id="$(tr -d '\r\n' < "$review_root/current-release")"
  [[ "$previous_release_id" =~ ^[0-9a-f]{40}$ ]] || previous_release_id=""
fi

prune_superseded_review_artifacts() {
  local candidate candidate_id marker repository tag
  shopt -s nullglob
  for candidate in "$review_root/releases"/*; do
    [[ -d "$candidate" ]] || continue
    candidate_id="$(basename "$candidate")"
    [[ "$candidate_id" =~ ^[0-9a-f]{40}$ ]] || continue
    [[ "$candidate_id" != "$release_id" ]] || continue
    [[ -z "$previous_release_id" || "$candidate_id" != "$previous_release_id" ]] || continue
    [[ -f "$candidate/RELEASE" ]] || continue
    marker="$(tr -d '\r\n' < "$candidate/RELEASE")"
    [[ "$marker" == "$candidate_id" ]] || continue
    if rm -rf -- "$candidate"; then
      echo "Pruned superseded review release $candidate_id"
    else
      echo "Warning: superseded review release could not be pruned: $candidate_id" >&2
    fi
  done

  for repository in jingtang-review jingtang-review-migration; do
    while IFS= read -r tag; do
      [[ "$tag" =~ ^[0-9a-f]{40}$ ]] || continue
      [[ "$tag" != "$release_id" ]] || continue
      [[ -z "$previous_release_id" || "$tag" != "$previous_release_id" ]] || continue
      docker image rm "$repository:$tag" >/dev/null 2>&1 \
        && echo "Pruned superseded review image $repository:$tag" \
        || echo "Warning: review image remains in use and was retained: $repository:$tag" >&2
    done < <(docker image ls "$repository" --format '{{.Tag}}')
  done

  if [[ -d "$review_root/transfer-cache" ]]; then
    find "$review_root/transfer-cache" -maxdepth 1 -type f \
      -name 'jingtang-review-images.tar.incoming-*' -mtime +1 -delete \
      || echo "Warning: stale Review transfer cache files could not be pruned." >&2
  fi
}

install -d -m 0700 "$rollback_dir" "$review_root/init"
# Older Review preparation created this bind-mount source as a directory when
# the file did not yet exist. Preserve that malformed path for diagnosis and
# normalize the live source to a regular executable before snapshot/activation.
if [[ -d "$review_root/init/001-create-roles.sh" ]]; then
  mv "$review_root/init/001-create-roles.sh" \
    "$rollback_dir/malformed-review-init-create-roles"
  install -m 0755 "$candidate_init" "$review_root/init/001-create-roles.sh"
fi
for entry in \
  "$review_root/compose.yaml:review-compose.yaml" \
  "$review_root/release.env:review-release.env" \
  "$review_root/current-release:review-current-release" \
  "$review_root/init/001-create-roles.sh:review-init-create-roles.sh" \
  "$site_root/compose.yaml:site-compose.yaml" \
  "$site_root/Caddyfile:site-Caddyfile"; do
  source_file="${entry%%:*}"
  rollback_file="${entry#*:}"
  [[ -f "$source_file" ]] && cp -p "$source_file" "$rollback_dir/$rollback_file"
done

rolled_back=false
rollback() {
  [[ "$rolled_back" == true ]] && return
  rolled_back=true
  set +e
  [[ -f "$review_root/compose.yaml" && -f "$review_root/release.env" ]] && compose_live down --remove-orphans >/dev/null 2>&1
  for entry in \
    "$rollback_dir/site-compose.yaml:$site_root/compose.yaml" \
    "$rollback_dir/site-Caddyfile:$site_root/Caddyfile"; do
    [[ -f "${entry%%:*}" ]] && cp -p "${entry%%:*}" "${entry#*:}"
  done
  site_live up -d --force-recreate >/dev/null 2>&1 || true
  for entry in \
    "$rollback_dir/review-compose.yaml:$review_root/compose.yaml" \
    "$rollback_dir/review-release.env:$review_root/release.env" \
    "$rollback_dir/review-current-release:$review_root/current-release" \
    "$rollback_dir/review-init-create-roles.sh:$review_root/init/001-create-roles.sh"; do
    if [[ -d "${entry#*:}" ]]; then
      mv "${entry#*:}" "$rollback_dir/unexpected-$(basename "${entry#*:}")-during-rollback"
    fi
    if [[ -f "${entry%%:*}" ]]; then
      cp -p "${entry%%:*}" "${entry#*:}"
    else
      rm -f "${entry#*:}"
    fi
  done
  if [[ "$previous_review_running" == true ]] \
    && [[ -f "$review_root/compose.yaml" && -f "$review_root/release.env" ]]; then
    compose_live up -d postgres platform worker >/dev/null 2>&1 || \
      echo "Warning: the prior review release could not be restarted automatically." >&2
  fi
  set -e
}
on_error() {
  status=$?
  trap - ERR
  rollback
  echo "Review activation failed; public-site configuration was restored." >&2
  exit "$status"
}
trap on_error ERR

install -m 0644 "$candidate_compose" "$review_root/compose.yaml.next"
install -m 0600 "$candidate_release_env" "$review_root/release.env.next"
install -m 0644 "$candidate_site_compose" "$site_root/compose.yaml.next"
install -m 0644 "$candidate_caddyfile" "$site_root/Caddyfile.next"
install -m 0755 "$candidate_init" "$review_root/init/001-create-roles.sh.next"
mv "$review_root/compose.yaml.next" "$review_root/compose.yaml"
mv "$review_root/release.env.next" "$review_root/release.env"
mv "$site_root/compose.yaml.next" "$site_root/compose.yaml"
mv "$site_root/Caddyfile.next" "$site_root/Caddyfile"
mv "$review_root/init/001-create-roles.sh.next" "$review_root/init/001-create-roles.sh"

compose_live up -d postgres
compose_live --profile tools run --rm migrate
compose_live up -d platform worker
site_live up -d --force-recreate

for _ in {1..30}; do
  platform_state="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' jingtang-review-platform-1 2>/dev/null || true)"
  worker_state="$(docker inspect --format '{{.State.Status}}' jingtang-review-worker-1 2>/dev/null || true)"
  site_state="$(docker inspect --format '{{.State.Status}}' jingtang-public-site 2>/dev/null || true)"
  if [[ "$platform_state" == healthy && "$worker_state" == running && "$site_state" == running ]]; then
    smoke_ready=false
    for _ in {1..24}; do
      if curl --noproxy '*' --fail --silent --show-error --location \
        --max-time 15 https://jingtangai.com/ >/dev/null; then
        review_headers="$(curl --noproxy '*' --fail --silent --show-error \
          --dump-header - --output /dev/null --max-time 15 \
          https://review.jingtangai.com/api/v1/health || true)"
        if grep -Eiq '^x-robots-tag:.*noindex' <<<"$review_headers"; then
          smoke_ready=true
          break
        fi
      fi
      sleep 5
    done
    if [[ "$smoke_ready" != true ]]; then
      echo "Public website or review HTTPS/noindex smoke did not pass." >&2
      false
    fi
    printf '%s\n' "$release_id" > "$review_root/current-release.next"
    mv "$review_root/current-release.next" "$review_root/current-release"
    printf '%s %s %s\n' "$(date -u +%FT%TZ)" "$release_id" "$change_reference" >> "$review_root/change-record.log"
    trap - ERR
    prune_superseded_review_artifacts
    compose_live ps
    site_live ps
    exit 0
  fi
  sleep 5
done

echo "Review release did not become ready (platform=$platform_state worker=$worker_state site=$site_state)." >&2
docker logs --tail 100 jingtang-review-platform-1 >&2 2>/dev/null || true
docker logs --tail 100 jingtang-review-worker-1 >&2 2>/dev/null || true
false
