// Grants or removes a platform staff role. There is deliberately no HTTP endpoint for this:
// the first admin must be created by someone with server/database access.
//
// Usage: pnpm platform:grant --email maria@example.com --role admin|reviewer|none
//        pnpm platform:grant --phone 0414-1234567 --role reviewer
import { parseArgs } from 'node:util';
import { eq } from 'drizzle-orm';
import pg from 'pg';
import { PLATFORM_ROLES, type PlatformRole } from '@vtp/shared-types';
import { validateDatabaseEnv } from '../config/env.schema.js';
import { createDatabase } from '../database/database.service.js';
import { normalizeEmail, normalizePhone } from '../modules/identity/contact.js';
import { users } from '../modules/identity/identity.schema.js';

const { values } = parseArgs({
  options: { email: { type: 'string' }, phone: { type: 'string' }, role: { type: 'string' } },
});

const role = values.role === 'none' ? null : (values.role as PlatformRole | undefined);
if (values.role === undefined || (role !== null && !PLATFORM_ROLES.includes(role!))) {
  console.error(`--role must be one of: ${PLATFORM_ROLES.join(', ')}, none`);
  process.exit(1);
}
const email = values.email ? normalizeEmail(values.email) : null;
const phone = values.phone ? normalizePhone(values.phone) : null;
if (!email && !phone) {
  console.error('Pass a valid --email or --phone of an existing account');
  process.exit(1);
}

const env = validateDatabaseEnv(process.env);
const pool = new pg.Pool({
  host: env.DATABASE_HOST,
  port: env.DATABASE_PORT,
  database: env.DATABASE_NAME,
  user: env.DATABASE_USER,
  password: env.DATABASE_PASSWORD,
  ssl: env.DATABASE_SSL ? { rejectUnauthorized: true } : false,
  max: 1,
});

try {
  const [updated] = await createDatabase(pool)
    .update(users)
    .set({ platformRole: role })
    .where(email ? eq(users.email, email) : eq(users.phone, phone!))
    .returning({ id: users.id });
  if (!updated) {
    console.error('No account found. The person must sign up first.');
    process.exitCode = 1;
  } else {
    console.warn(`Platform role of user ${updated.id} set to ${role ?? 'none'}`);
  }
} finally {
  await pool.end();
}
