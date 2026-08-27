#!/usr/bin/env bash

set -euo pipefail
umask 077

readonly release_id="${1:-$(git rev-parse HEAD)}"
readonly output_root="${2:-.local/review-release}"
readonly output_dir="$output_root/$release_id"
readonly runtime_image="jingtang-review:$release_id"
readonly migration_image="jingtang-review-migration:$release_id"

if [[ ! "$release_id" =~ ^[0-9a-f]{40}$ ]] || [[ "$(git rev-parse HEAD)" != "$release_id" ]]; then
  echo "Package an exact current Git commit." >&2
  exit 2
fi
if [[ -n "$(git status --porcelain --untracked-files=all)" ]]; then
  echo "Refusing to package a dirty or untracked working tree." >&2
  exit 3
fi
if [[ -e "$output_dir" ]]; then
  echo "Refusing to replace an existing review release package." >&2
  exit 4
fi

cleanup_package_attempt() {
  local status=$?
  trap - EXIT
  docker image rm "$runtime_image" "$migration_image" >/dev/null 2>&1 || true
  if ((status != 0)) && [[ -d "$output_dir" ]]; then
    rm -rf -- "$output_dir"
  fi
  exit "$status"
}

prune_stale_release_packages() {
  local candidate candidate_id marker
  shopt -s nullglob
  for candidate in "$output_root"/*; do
    [[ -d "$candidate" ]] || continue
    candidate_id="$(basename "$candidate")"
    [[ "$candidate_id" =~ ^[0-9a-f]{40}$ ]] || continue
    [[ "$candidate_id" != "$release_id" ]] || continue
    [[ -f "$candidate/RELEASE" ]] || continue
    marker="$(tr -d '\r\n' < "$candidate/RELEASE")"
    [[ "$marker" == "$candidate_id" ]] || continue
    rm -rf -- "$candidate"
    echo "Pruned superseded review release package $candidate_id"
  done
}

trap cleanup_package_attempt EXIT

install -d -m 0700 "$output_dir/init" "$output_dir/systemd"
docker build --pull=false --target runtime --build-arg "VCS_REF=$release_id" \
  --tag "$runtime_image" .
docker build --pull=false --target migration --build-arg "VCS_REF=$release_id" \
  --tag "$migration_image" .
docker run --rm --network none --user 65532:65532 --workdir /app/apps/worker \
  --entrypoint node "$runtime_image" --input-type=module --eval '
    import { access } from "node:fs/promises";
    import { createRequire } from "node:module";
    await access("/app/apps/platform/scripts/start.mjs");
    await access("/app/packages/db/node_modules/prisma/build/index.js");
    const requireFromPlatform = createRequire("file:///app/apps/platform/scripts/start.mjs");
    requireFromPlatform.resolve("next/dist/bin/next");
    await import("@jingtang/application");
  '
docker run --rm --network none --user 65532:65532 --workdir /app/packages/db \
  --env DATABASE_URL=postgresql://invalid:invalid@127.0.0.1:1/invalid \
  "$migration_image" node /app/packages/db/node_modules/prisma/build/index.js validate
docker save --output "$output_dir/jingtang-review-images.tar" \
  "$runtime_image" "$migration_image"

install -m 0644 infra/tencent/review/compose.yaml "$output_dir/compose.yaml"
install -m 0755 infra/tencent/review/init/001-create-roles.sh \
  "$output_dir/init/001-create-roles.sh"
install -m 0644 infra/tencent/public-site/compose.yaml "$output_dir/public-site-compose.yaml"
install -m 0644 infra/tencent/public-site/Caddyfile "$output_dir/public-site-Caddyfile"
for script in \
  activate-release.sh backup-review.sh check-capacity.sh generate-internal-secrets.sh \
  install-external-secret.sh install-maintenance-timers.sh prepare-host.sh \
  restore-review-drill.sh transfer-release.sh; do
  install -m 0755 "infra/tencent/review/$script" "$output_dir/$script"
done
install -m 0644 infra/tencent/review/systemd/*.service infra/tencent/review/systemd/*.timer \
  "$output_dir/systemd/"
install -m 0600 infra/tencent/review/runtime.env.example "$output_dir/runtime.env.example"

(
  cd "$output_dir"
  sha256sum jingtang-review-images.tar > SHA256SUMS
)
printf '%s\n' "$release_id" > "$output_dir/RELEASE"
prune_stale_release_packages
echo "Review release package created at $output_dir"
