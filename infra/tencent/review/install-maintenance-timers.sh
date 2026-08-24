#!/usr/bin/env bash

set -euo pipefail

if [[ "${EUID:-$(id -u)}" -ne 0 ]]; then
  echo "Install review maintenance timers as root." >&2
  exit 2
fi

readonly root=/srv/jingtang/review
readonly release_id="$(cat "$root/current-release" 2>/dev/null || true)"
if [[ ! "$release_id" =~ ^[0-9a-f]{40}$ ]]; then
  echo "A healthy activated review release is required." >&2
  exit 3
fi
readonly release_dir="$root/releases/$release_id"
for unit in \
  jingtang-review-backup.service jingtang-review-backup.timer \
  jingtang-review-capacity.service jingtang-review-capacity.timer; do
  [[ -f "$release_dir/systemd/$unit" ]] || {
    echo "Missing maintenance unit: $unit" >&2
    exit 4
  }
done

for script in backup-review.sh check-capacity.sh restore-review-drill.sh; do
  install -m 0755 "$release_dir/$script" "$root/$script"
done
install -m 0644 "$release_dir/systemd/"*.service "$release_dir/systemd/"*.timer \
  /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now jingtang-review-backup.timer jingtang-review-capacity.timer
systemctl list-timers --all jingtang-review-backup.timer jingtang-review-capacity.timer
