// Aggregates the Drizzle table definitions of every feature module.
// Each module owns its tables in src/modules/<name>/<name>.schema.ts and is re-exported here.
// After changing a schema run `pnpm db:generate --name=<change>` and commit apps/api/drizzle/.
export * from '../modules/identity/identity.schema.js';
export * from '../modules/audit/audit.schema.js';
export * from '../modules/organizations/organizations.schema.js';
export * from '../modules/onboarding/onboarding.schema.js';
export * from '../modules/fleet/fleet.schema.js';
export * from '../modules/network/network.schema.js';
export * from '../modules/bookings/bookings.schema.js';
export * from '../modules/payments/payments.schema.js';
export * from '../modules/taxi/taxi.schema.js';
export * from '../modules/settlements/settlements.schema.js';
