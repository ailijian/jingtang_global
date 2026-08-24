#!/usr/bin/env bash

set -euo pipefail

if [[ "${EUID:-$(id -u)}" -ne 0 ]]; then
  echo "Run review host preparation as root." >&2
  exit 2
fi

readonly root=/srv/jingtang/review
readonly service_uid=65532
install -d -m 0700 "$root" "$root/releases" "$root/secrets" "$root/backup-work"
install -d -m 0700 -o 70 -g 70 "$root/postgres"
install -d -m 0700 -o "$service_uid" -g "$service_uid" "$root/state" "$root/backup-work"
docker network inspect jingtang-ingress >/dev/null 2>&1 || docker network create jingtang-ingress >/dev/null

memory_kib="$(awk '/^MemTotal:/ {print $2}' /proc/meminfo)"
swap_kib="$(awk '/^SwapTotal:/ {print $2}' /proc/meminfo)"
cpu_count="$(getconf _NPROCESSORS_ONLN)"
free_kib="$(df -Pk "$root" | awk 'NR == 2 {print $4}')"
if (( memory_kib < 3500000 || cpu_count < 2 || free_kib < 10485760 )); then
  echo "Host does not meet the review minimum (2 CPU, 3.5 GiB memory, 10 GiB free)." >&2
  exit 3
fi
if (( swap_kib < 1048576 )); then
  echo "Host preparation completed, but at least 1 GiB controlled swap is still required." >&2
  exit 4
fi
echo "Review host boundary prepared; CPU, memory, disk, swap, and ingress network checks passed."
