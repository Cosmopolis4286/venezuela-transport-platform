#!/usr/bin/env bash
set -Eeuo pipefail

: "${VTP_APP_DB_USER:?VTP_APP_DB_USER is required}"
: "${VTP_APP_DB_PASSWORD:?VTP_APP_DB_PASSWORD is required}"

# This script is sourced by the official PostgreSQL entrypoint on first initialization.
# The owner role creates schema objects; the runtime role gets DML privileges only.
psql --set=ON_ERROR_STOP=1 \
  --username "$POSTGRES_USER" \
  --dbname "$POSTGRES_DB" \
  --set=owner_user="$POSTGRES_USER" \
  --set=app_user="$VTP_APP_DB_USER" \
  --set=app_password="$VTP_APP_DB_PASSWORD" <<'SQL'
SELECT format('CREATE ROLE %I LOGIN PASSWORD %L', :'app_user', :'app_password')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = :'app_user')
\gexec

GRANT CONNECT ON DATABASE :"POSTGRES_DB" TO :"app_user";
GRANT USAGE ON SCHEMA public TO :"app_user";
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO :"app_user";
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO :"app_user";
ALTER DEFAULT PRIVILEGES FOR ROLE :"owner_user" IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO :"app_user";
ALTER DEFAULT PRIVILEGES FOR ROLE :"owner_user" IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO :"app_user";
SQL
