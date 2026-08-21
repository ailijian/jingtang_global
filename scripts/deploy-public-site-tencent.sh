#!/usr/bin/env bash

set -euo pipefail

readonly repository_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
readonly site_target="${SITE_SSH_TARGET:-jingtang-production}"
readonly site_identity="${SITE_SSH_IDENTITY:-}"
readonly site_root="/srv/jingtang/public-site"
readonly release_id="${SITE_RELEASE_ID:-$(git -C "$repository_root" rev-parse HEAD)}"

if [[ ! "$release_id" =~ ^[0-9a-f]{7,64}$ ]]; then
  echo "SITE_RELEASE_ID must be a lowercase Git SHA." >&2
  exit 2
fi

ssh_options=(-o BatchMode=yes)
if [[ -n "$site_identity" ]]; then
  ssh_options+=(-o IdentitiesOnly=yes -i "$site_identity")
fi

rsync_shell="ssh -o BatchMode=yes"
if [[ -n "$site_identity" ]]; then
  rsync_shell+=" -o IdentitiesOnly=yes -i $site_identity"
fi

cd "$repository_root"
pnpm site:release-check
pnpm build:packages
pnpm --filter @jingtang/site build

ssh "${ssh_options[@]}" "$site_target" \
  "install -d -m 0755 '$site_root/releases/$release_id' '$site_root/logs'"

rsync --archive --delete --chmod=Du=rwx,Dgo=rx,Fu=rw,Fgo=r \
  -e "$rsync_shell" \
  "$repository_root/apps/site/out/" \
  "$site_target:$site_root/releases/$release_id/"

rsync --archive --chmod=Fu=rwx,Fgo=rx \
  -e "$rsync_shell" \
  "$repository_root/infra/tencent/public-site/Caddyfile" \
  "$repository_root/infra/tencent/public-site/compose.yaml" \
  "$repository_root/infra/tencent/public-site/activate-release.sh" \
  "$site_target:$site_root/"

ssh "${ssh_options[@]}" "$site_target" \
  "'$site_root/activate-release.sh' '$release_id'"
