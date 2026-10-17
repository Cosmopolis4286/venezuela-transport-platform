-- Baseline: database extensions required by the platform. Idempotent.
-- Local Docker databases already have these from infrastructure/docker/postgres/init/.
-- PostGIS is not a "trusted" extension: on managed/production databases a superuser or
-- the provider's admin role may have to create it once before this migration runs.
CREATE EXTENSION IF NOT EXISTS postgis;
--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS pgcrypto;
--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS citext;
--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS pg_trgm;
