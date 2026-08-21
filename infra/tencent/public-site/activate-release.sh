#!/usr/bin/env bash

set -euo pipefail

readonly site_root="/srv/jingtang/public-site"
readonly release_id="${1:-}"

if [[ ! "$release_id" =~ ^[0-9a-f]{7,64}$ ]]; then
  echo "Release id must be a 7-64 character lowercase Git SHA." >&2
  exit 2
fi

readonly release_target="releases/$release_id"
if [[ ! -f "$site_root/$release_target/index.html" ]]; then
  echo "Release $release_id does not contain index.html." >&2
  exit 3
fi

previous_target=""
if [[ -L "$site_root/current" ]]; then
  previous_target="$(readlink "$site_root/current")"
fi

ln -sfn "$release_target" "$site_root/current"

rollback() {
  if [[ -n "$previous_target" ]]; then
    ln -sfn "$previous_target" "$site_root/current"
    docker compose --project-directory "$site_root" -f "$site_root/compose.yaml" up -d --force-recreate >/dev/null 2>&1 || true
  else
    unlink "$site_root/current" 2>/dev/null || true
  fi
}

if ! docker compose --project-directory "$site_root" -f "$site_root/compose.yaml" config --quiet; then
  rollback
  exit 4
fi

if ! docker compose --project-directory "$site_root" -f "$site_root/compose.yaml" up -d --pull always --force-recreate; then
  rollback
  exit 5
fi

for _ in {1..30}; do
  if [[ "$(docker inspect --format '{{.State.Running}}' jingtang-public-site 2>/dev/null || true)" == "true" ]]; then
    docker compose --project-directory "$site_root" -f "$site_root/compose.yaml" ps
    exit 0
  fi
  sleep 1
done

rollback
echo "The public-site container did not reach running state." >&2
exit 6
