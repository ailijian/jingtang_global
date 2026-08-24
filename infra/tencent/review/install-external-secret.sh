#!/usr/bin/env bash

set -euo pipefail
umask 077

if [[ "${EUID:-$(id -u)}" -ne 0 ]]; then
  echo "Install review external secrets as root." >&2
  exit 2
fi

readonly name="${1:-}"
readonly service_uid=65532
case "$name" in
  platform-cam-secret-id|platform-cam-secret-key|worker-cam-secret-id|worker-cam-secret-key|backup-cam-secret-id|backup-cam-secret-key|youtube-client-secret) ;;
  *)
    echo "Unsupported secret name." >&2
    exit 3
    ;;
esac

IFS= read -r -s -p "Enter $name: " value
printf '\n'
if [[ -z "$value" || "$value" == *$'\n'* || "$value" == *$'\r'* ]]; then
  echo "Secret value is invalid." >&2
  exit 4
fi
readonly target="/srv/jingtang/review/secrets/$name"
if [[ -e "$target" ]]; then
  echo "Refusing to replace an existing secret; remove or rotate it explicitly first." >&2
  exit 5
fi
printf '%s\n' "$value" > "$target.next"
chown "$service_uid:$service_uid" "$target.next"
chmod 0400 "$target.next"
mv "$target.next" "$target"
unset value
echo "$name installed without echoing its value."
