-- Executed by the official entrypoint ONLY when the data volume is first created.
-- Keep this limited to extensions and database-level settings. Schema objects
-- (tables, indexes) belong in versioned migrations, never here.
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pgcrypto;  -- gen_random_uuid(), digest()
CREATE EXTENSION IF NOT EXISTS citext;    -- case-insensitive text (emails)
CREATE EXTENSION IF NOT EXISTS pg_trgm;   -- fuzzy search (city/terminal names)
