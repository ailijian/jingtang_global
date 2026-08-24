#!/usr/bin/env sh

set -eu

app_password="$(cat "$APP_DB_PASSWORD_FILE")"
worker_password="$(cat "$WORKER_DB_PASSWORD_FILE")"
if [ -z "$app_password" ] || [ -z "$worker_password" ]; then
  echo "Review database role secrets are missing." >&2
  exit 1
fi

psql --set=ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
  --set=app_password="$app_password" --set=worker_password="$worker_password" <<'SQL'
SELECT format(
  'CREATE ROLE %I LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION',
  'jingtang_app', :'app_password'
) WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'jingtang_app') \gexec
SELECT format('ALTER ROLE %I PASSWORD %L', 'jingtang_app', :'app_password') \gexec

SELECT format(
  'CREATE ROLE %I LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION',
  'jingtang_worker', :'worker_password'
) WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'jingtang_worker') \gexec
SELECT format('ALTER ROLE %I PASSWORD %L', 'jingtang_worker', :'worker_password') \gexec
SQL
