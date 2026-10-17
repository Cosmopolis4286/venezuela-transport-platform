// Aggregates the Drizzle table definitions of every feature module.
// Each module owns its tables in src/modules/<name>/<name>.schema.ts and is re-exported here, e.g.
//   export * from '../modules/terminals/terminals.schema.js';
// Then run `pnpm db:generate --name=<change>` and commit the generated SQL in apps/api/drizzle/.
export {};
