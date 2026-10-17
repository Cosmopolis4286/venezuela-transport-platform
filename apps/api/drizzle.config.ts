import { defineConfig } from 'drizzle-kit';

// Used by `pnpm db:generate` to diff src/database/schema.ts against previous migrations.
// Migrations are applied by `pnpm db:migrate` (src/database/migrate.ts), not by drizzle-kit.
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/database/schema.ts',
  out: './drizzle',
  casing: 'snake_case',
  strict: true,
  verbose: true,
});
