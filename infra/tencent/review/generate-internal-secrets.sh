#!/usr/bin/env bash

set -euo pipefail
umask 077

if [[ "${EUID:-$(id -u)}" -ne 0 ]]; then
  echo "Generate review internal secrets as root." >&2
  exit 2
fi

readonly secret_root=/srv/jingtang/review/secrets
readonly service_uid=65532
install -d -m 0700 "$secret_root"
for required_absent in \
  postgres-admin-password postgres-app-password postgres-worker-password \
  database-admin-url database-app-url database-worker-url \
  platform-session-cookie worker-config-secret youtube-state-secret \
  facebook-state-secret tiktok-state-secret \
  oauth-token-encryption-key backup-encryption-key reviewer-password; do
  if [[ -e "$secret_root/$required_absent" ]]; then
    echo "Refusing to replace existing secret: $required_absent" >&2
    exit 3
  fi
done

postgres_admin="$(openssl rand -hex 24)"
postgres_app="$(openssl rand -hex 24)"
postgres_worker="$(openssl rand -hex 24)"

install_value() {
  local owner="$1" name="$2" value="$3"
  printf '%s\n' "$value" > "$secret_root/$name.next"
  chown "$owner:$owner" "$secret_root/$name.next"
  chmod 0400 "$secret_root/$name.next"
  mv "$secret_root/$name.next" "$secret_root/$name"
}

install_value 70 postgres-admin-password "$postgres_admin"
install_value 70 postgres-app-password "$postgres_app"
install_value 70 postgres-worker-password "$postgres_worker"
install_value 0 database-admin-url "postgresql://postgres:${postgres_admin}@postgres:5432/jingtang?sslmode=disable"
install_value "$service_uid" database-app-url "postgresql://jingtang_app:${postgres_app}@postgres:5432/jingtang?sslmode=disable"
install_value "$service_uid" database-worker-url "postgresql://jingtang_worker:${postgres_worker}@postgres:5432/jingtang?sslmode=disable"
install_value "$service_uid" platform-session-cookie "$(openssl rand -base64 48 | tr -d '\n')"
install_value "$service_uid" worker-config-secret "$(openssl rand -base64 48 | tr -d '\n')"
install_value "$service_uid" youtube-state-secret "$(openssl rand -base64 48 | tr -d '\n')"
install_value "$service_uid" facebook-state-secret "$(openssl rand -base64 48 | tr -d '\n')"
install_value "$service_uid" tiktok-state-secret "$(openssl rand -base64 48 | tr -d '\n')"
install_value "$service_uid" oauth-token-encryption-key "$(openssl rand -base64 32 | tr '+/' '-_' | tr -d '=\n')"
install_value "$service_uid" backup-encryption-key "$(openssl rand -base64 32 | tr -d '\n')"
install_value "$service_uid" reviewer-password "$(openssl rand -base64 24 | tr -d '\n')"

unset postgres_admin postgres_app postgres_worker
echo "Internal review secrets generated. External CAM and OAuth secrets remain intentionally unset."
