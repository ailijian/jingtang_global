#!/usr/bin/env bash

set -euo pipefail
umask 077

readonly release_id="${1:-$(git rev-parse HEAD)}"
readonly output_root="${2:-.local/review-release}"
readonly output_dir="$output_root/$release_id"

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

install -d -m 0700 "$output_dir/init" "$output_dir/systemd"
docker build --pull=false --target runtime --build-arg "VCS_REF=$release_id" \
  --tag "jingtang-review:$release_id" .
docker build --pull=false --target migration --build-arg "VCS_REF=$release_id" \
  --tag "jingtang-review-migration:$release_id" .
docker run --rm --network none --user 65532:65532 --workdir /app/apps/worker \
  --entrypoint node "jingtang-review:$release_id" --input-type=module --eval '
    import { access } from "node:fs/promises";
    import { createRequire } from "node:module";
    await access("/app/apps/platform/scripts/start.mjs");
    const requireFromPlatform = createRequire("file:///app/apps/platform/scripts/start.mjs");
    requireFromPlatform.resolve("next/dist/bin/next");
    await import("@jingtang/application");
  '
docker save "jingtang-review:$release_id" | gzip -9 > "$output_dir/jingtang-review.tar.gz"
docker save "jingtang-review-migration:$release_id" | gzip -9 > "$output_dir/jingtang-review-migration.tar.gz"

install -m 0644 infra/tencent/review/compose.yaml "$output_dir/compose.yaml"
install -m 0755 infra/tencent/review/init/001-create-roles.sh \
  "$output_dir/init/001-create-roles.sh"
install -m 0644 infra/tencent/public-site/compose.yaml "$output_dir/public-site-compose.yaml"
install -m 0644 infra/tencent/public-site/Caddyfile "$output_dir/public-site-Caddyfile"
for script in \
  activate-release.sh backup-review.sh check-capacity.sh generate-internal-secrets.sh \
  install-external-secret.sh install-maintenance-timers.sh prepare-host.sh \
  restore-review-drill.sh; do
  install -m 0755 "infra/tencent/review/$script" "$output_dir/$script"
done
install -m 0644 infra/tencent/review/systemd/*.service infra/tencent/review/systemd/*.timer \
  "$output_dir/systemd/"
install -m 0600 infra/tencent/review/runtime.env.example "$output_dir/runtime.env.example"

(
  cd "$output_dir"
  sha256sum jingtang-review.tar.gz jingtang-review-migration.tar.gz > SHA256SUMS
)
printf '%s\n' "$release_id" > "$output_dir/RELEASE"
echo "Review release package created at $output_dir"
