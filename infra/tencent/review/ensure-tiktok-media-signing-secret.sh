#!/usr/bin/env bash

set -euo pipefail
umask 077

if [[ "${EUID:-$(id -u)}" -ne 0 ]]; then
  echo "Ensure the TikTok media signing secret as root." >&2
  exit 2
fi

readonly secret_root=/srv/jingtang/review/secrets
readonly service_uid=65532
readonly target="$secret_root/tiktok-media-url-signing-secret"

validate_target() {
  local metadata byte_count
  if [[ ! -f "$target" || -L "$target" ]]; then
    echo "TikTok media signing secret must be a regular non-symlink file." >&2
    exit 3
  fi
  metadata="$(stat -c '%a %u %g' "$target")"
  if [[ "$metadata" != "400 $service_uid $service_uid" ]]; then
    echo "TikTok media signing secret must use mode 0400 and service ownership." >&2
    exit 3
  fi
  byte_count="$(wc -c < "$target")"
  if ((byte_count < 32)); then
    echo "TikTok media signing secret is too short." >&2
    exit 3
  fi
}

install -d -o 0 -g 0 -m 0700 "$secret_root"
if [[ -e "$target" || -L "$target" ]]; then
  validate_target
  echo "TikTok media signing secret already exists and was preserved."
  exit 0
fi

readonly next="$target.next.$$"
cleanup() {
  rm -f -- "$next"
}
trap cleanup EXIT
install -o "$service_uid" -g "$service_uid" -m 0400 /dev/null "$next"
openssl rand -base64 48 | tr -d '\n' > "$next"
printf '\n' >> "$next"
ln "$next" "$target"
rm -f -- "$next"
trap - EXIT
validate_target
echo "TikTok media signing secret created without exposing its value."
