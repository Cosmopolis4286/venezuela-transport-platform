import { index, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { users } from '../identity/identity.schema.js';

/**
 * Append-only record of security-relevant actions. Never store secrets, tokens, codes or
 * raw personal data in `metadata` — reference records by id instead.
 */
export const auditEvents = pgTable(
  'audit_events',
  {
    id: uuid().primaryKey().defaultRandom(),
    actorUserId: uuid().references(() => users.id, { onDelete: 'set null' }),
    action: text().notNull(),
    targetType: text(),
    targetId: text(),
    ip: text(),
    metadata: jsonb().$type<Record<string, unknown>>(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('audit_events_actor_created_idx').on(t.actorUserId, t.createdAt),
    index('audit_events_action_created_idx').on(t.action, t.createdAt),
  ],
);
