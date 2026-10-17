// Verifies PostgreSQL + PostGIS connectivity using the same variables as the API.
// Usage: pnpm db:check   (reads apps/api/.env when present)
import pg from 'pg';

const required = ['DATABASE_HOST', 'DATABASE_NAME', 'DATABASE_USER', 'DATABASE_PASSWORD'];
const missing = required.filter((name) => !process.env[name]);
if (missing.length > 0) {
  console.error(`Missing environment variables: ${missing.join(', ')}. Run "pnpm env:init" first.`);
  process.exit(1);
}

const client = new pg.Client({
  host: process.env.DATABASE_HOST,
  port: Number(process.env.DATABASE_PORT ?? 5432),
  database: process.env.DATABASE_NAME,
  user: process.env.DATABASE_USER,
  password: process.env.DATABASE_PASSWORD,
  ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: true } : false,
  connectionTimeoutMillis: 5_000,
});

try {
  await client.connect();
  const { rows } = await client.query(
    'SELECT current_setting($1) AS server_version, postgis_lib_version() AS postgis_version',
    ['server_version'],
  );
  console.log(
    `OK: PostgreSQL ${rows[0].server_version}, PostGIS ${rows[0].postgis_version} at ` +
      `${process.env.DATABASE_HOST}:${process.env.DATABASE_PORT ?? 5432}/${process.env.DATABASE_NAME}`,
  );
} catch (error) {
  console.error(`Database check failed: ${error.message}`);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
