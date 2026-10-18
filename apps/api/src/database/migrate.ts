// Applies pending SQL migrations from apps/api/drizzle/ and exits.
// Run as a separate deploy step BEFORE starting a new API version — never at API boot.
// Usage: pnpm db:migrate   (production: node dist/database/migrate.js)
import { fileURLToPath } from 'node:url';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';
import { validateDatabaseEnv } from '../config/env.schema.js';

const env = validateDatabaseEnv(process.env);
// dist/database/migrate.js → apps/api/drizzle
const migrationsFolder = fileURLToPath(new URL('../../drizzle', import.meta.url));

const pool = new pg.Pool({
  host: env.DATABASE_HOST,
  port: env.DATABASE_PORT,
  database: env.DATABASE_NAME,
  user: env.DATABASE_USER,
  password: env.DATABASE_PASSWORD,
  ssl: env.DATABASE_SSL ? { rejectUnauthorized: true } : false,
  max: 1,
  application_name: 'vtp-migrate',
});

try {
  await migrate(drizzle(pool), { migrationsFolder });
  console.warn(
    `Migrations up to date (${env.DATABASE_HOST}:${env.DATABASE_PORT}/${env.DATABASE_NAME})`,
  );
} catch (error) {
  console.error(`Migration failed: ${(error as Error).message}`);
  process.exitCode = 1;
} finally {
  await pool.end();
}
