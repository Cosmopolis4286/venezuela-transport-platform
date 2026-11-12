#!/usr/bin/env bash
set -Eeuo pipefail

: "${POSTGRES_USER:?POSTGRES_USER debe estar definido por la imagen PostgreSQL}"
: "${POSTGRES_DB:?POSTGRES_DB debe estar definido por la imagen PostgreSQL}"
: "${POSTGRES_PASSWORD:?POSTGRES_PASSWORD debe estar definido}"
: "${VTP_APP_DB_USER:?Define VTP_APP_DB_USER en postgres.env}"
: "${VTP_APP_DB_PASSWORD:?Define VTP_APP_DB_PASSWORD en postgres.env}"

if [[ "$VTP_APP_DB_USER" == "$POSTGRES_USER" ]]; then
  echo "VTP_APP_DB_USER debe ser distinto de POSTGRES_USER." >&2
  exit 1
fi
if [[ "$VTP_APP_DB_PASSWORD" == "$POSTGRES_PASSWORD" ]]; then
  echo "La contraseña runtime debe ser distinta de la contraseña owner." >&2
  exit 1
fi

psql \
  --no-psqlrc \
  --username "$POSTGRES_USER" \
  --dbname "$POSTGRES_DB" \
  --set=ON_ERROR_STOP=1 \
  --set=app_user="$VTP_APP_DB_USER" \
  --set=app_password="$VTP_APP_DB_PASSWORD" <<'SQL'
SELECT format('CREATE ROLE %I LOGIN PASSWORD %L', :'app_user', :'app_password')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = :'app_user')
\gexec

SELECT format(
  'ALTER ROLE %I WITH LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD %L',
  :'app_user',
  :'app_password'
)
\gexec

SELECT format('GRANT CONNECT ON DATABASE %I TO %I', current_database(), :'app_user')
\gexec

SELECT format('GRANT USAGE ON SCHEMA public TO %I', :'app_user')
\gexec

SELECT format(
  'GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO %I',
  :'app_user'
)
\gexec

SELECT format(
  'GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO %I',
  :'app_user'
)
\gexec

SELECT format(
  'ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO %I',
  current_user,
  :'app_user'
)
\gexec

SELECT format(
  'ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO %I',
  current_user,
  :'app_user'
)
\gexec
SQL

echo "El rol runtime '$VTP_APP_DB_USER' está listo."
