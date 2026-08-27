#!/usr/bin/env bash

set -euo pipefail
umask 077

readonly ssh_target="${1:-${JT_SSH_TARGET:-}}"
readonly release_id="${2:-$(git rev-parse HEAD)}"
readonly output_root="${3:-.local/review-release}"
readonly release_dir="$output_root/$release_id"
readonly archive_name=jingtang-review-images.tar
readonly archive="$release_dir/$archive_name"
readonly review_root=/srv/jingtang/review
readonly remote_release_dir="$review_root/releases/$release_id"
readonly remote_incoming="$review_root/transfer-cache/$archive_name.incoming-$release_id"
readonly ssh_identity="${JT_SSH_IDENTITY:-}"

if [[ -z "$ssh_target" ]]; then
  echo "Pass an SSH target or set JT_SSH_TARGET." >&2
  exit 2
fi
if [[ ! "$release_id" =~ ^[0-9a-f]{40}$ ]]; then
  echo "A full Git SHA release id is required." >&2
  exit 2
fi
if [[ ! -f "$archive" || ! -f "$release_dir/SHA256SUMS" || ! -f "$release_dir/RELEASE" ]]; then
  echo "The packaged Review release is incomplete: $release_dir" >&2
  exit 3
fi
if [[ "$(tr -d '\r\n' < "$release_dir/RELEASE")" != "$release_id" ]]; then
  echo "The Review release marker does not match the requested release." >&2
  exit 3
fi
(
  cd "$release_dir"
  sha256sum --check --status SHA256SUMS
) || {
  echo "The local Review release failed checksum validation." >&2
  exit 3
}

ssh_options=(-o BatchMode=yes)
rsync_shell="ssh -o BatchMode=yes"
if [[ -n "$ssh_identity" ]]; then
  ssh_options+=(-o IdentitiesOnly=yes -i "$ssh_identity")
  printf -v quoted_identity '%q' "$ssh_identity"
  rsync_shell+=" -o IdentitiesOnly=yes -i $quoted_identity"
fi

"${ssh_options[@]}" "$ssh_target" \
  "bash -s -- '$release_id'" <<'REMOTE_PREPARE'
set -euo pipefail
readonly release_id="${1:-}"
readonly review_root=/srv/jingtang/review
readonly archive_name=jingtang-review-images.tar
readonly release_dir="$review_root/releases/$release_id"
readonly cache_dir="$review_root/transfer-cache"
readonly cache="$cache_dir/$archive_name"
readonly incoming="$cache.incoming-$release_id"

sudo install -d -m 0700 "$review_root/releases" "$cache_dir"
if [[ -d "$release_dir" ]] \
  && sudo find "$release_dir" -maxdepth 1 -type d -name 'rollback-*' -print -quit | grep -q .; then
  echo "Refusing to replace a Review release that already contains rollback evidence." >&2
  exit 4
fi
sudo install -d -m 0700 "$release_dir"

if ! sudo test -f "$cache" && sudo test -f "$review_root/current-release"; then
  current_release="$(sudo tr -d '\r\n' "$review_root/current-release")"
  if [[ "$current_release" =~ ^[0-9a-f]{40}$ ]] \
    && sudo docker image inspect "jingtang-review:$current_release" \
      "jingtang-review-migration:$current_release" >/dev/null 2>&1; then
    sudo docker save --output "$cache.bootstrap" \
      "jingtang-review:$current_release" "jingtang-review-migration:$current_release"
    sudo chmod 0600 "$cache.bootstrap"
    sudo mv "$cache.bootstrap" "$cache"
    echo "Bootstrapped Review transfer cache from deployed release $current_release"
  fi
fi

sudo rm -f -- "$incoming"
if sudo test -f "$cache"; then
  sudo cp --reflink=auto --sparse=always "$cache" "$incoming"
else
  sudo install -m 0600 /dev/null "$incoming"
fi
REMOTE_PREPARE

rsync --archive --delete --exclude "/$archive_name" \
  --rsync-path="sudo rsync" \
  -e "$rsync_shell" \
  "$release_dir/" "$ssh_target:$remote_release_dir/"

rsync --archive --inplace --no-whole-file --partial --human-readable --stats \
  --rsync-path="sudo rsync" \
  -e "$rsync_shell" \
  "$archive" "$ssh_target:$remote_incoming"

readonly archive_sha256="$(awk -v name="$archive_name" '$2 == name {print $1}' "$release_dir/SHA256SUMS")"
if [[ ! "$archive_sha256" =~ ^[0-9a-f]{64}$ ]]; then
  echo "The packaged Review image checksum is invalid." >&2
  exit 3
fi

"${ssh_options[@]}" "$ssh_target" \
  "sudo bash -s -- '$release_id' '$archive_sha256'" <<'REMOTE_FINALIZE'
set -euo pipefail
readonly release_id="${1:-}"
readonly archive_sha256="${2:-}"
readonly review_root=/srv/jingtang/review
readonly archive_name=jingtang-review-images.tar
readonly release_dir="$review_root/releases/$release_id"
readonly cache_dir="$review_root/transfer-cache"
readonly cache="$cache_dir/$archive_name"
readonly incoming="$cache.incoming-$release_id"

echo "$archive_sha256  $incoming" | sha256sum --check --status || {
  echo "The incrementally transferred Review image archive failed checksum validation." >&2
  exit 5
}
mv "$incoming" "$cache"
rm -f -- "$release_dir/$archive_name"
ln "$cache" "$release_dir/$archive_name"
(
  cd "$release_dir"
  sha256sum --check --status SHA256SUMS
)
chown -R root:root "$release_dir" "$cache_dir"
chmod 0700 "$release_dir" "$cache_dir"
chmod 0600 "$cache"
echo "Review release transferred with reusable image-layer cache: $release_id"
REMOTE_FINALIZE
