#!/usr/bin/env bash

set -euo pipefail

readonly root=/srv/jingtang/review
readonly free_kib="$(df -Pk "$root" | awk 'NR == 2 {print $4}')"
readonly swap_kib="$(awk '/^SwapTotal:/ {print $2}' /proc/meminfo)"
if (( free_kib < 8388608 )); then
  echo "Review host free disk is below 8 GiB." >&2
  exit 2
fi
if (( swap_kib < 1048576 )); then
  echo "Review host swap is below 1 GiB." >&2
  exit 3
fi
docker compose --project-directory "$root" \
  --env-file "$root/runtime.env" --env-file "$root/release.env" \
  -f "$root/compose.yaml" --profile tools run --rm storage-capacity
echo "Review host and COS capacity checks passed."
