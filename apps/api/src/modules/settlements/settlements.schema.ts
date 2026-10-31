import {
  index,
  integer,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { PAYOUT_METHODS } from '@vtp/shared-types';
import { bookings } from '../bookings/bookings.schema.js';
import { timestamps, users } from '../identity/identity.schema.js';
import { currency } from '../network/network.schema.js';
import { organizations } from '../organizations/organizations.schema.js';

export const payoutMethod = pgEnum('payout_method', PAYOUT_METHODS);

/** Commission agreed with one operator; operators without a row pay the platform default. */
export const organizationCommissions = pgTable('organization_commissions', {
  organizationId: uuid()
    .primaryKey()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  /** Percentage, e.g. 8.50. */
  rate: numeric({ precision: 5, scale: 2 }).notNull(),
  updatedByUserId: uuid().references(() => users.id, { onDelete: 'set null' }),
  ...timestamps,
});

/**
 * What one paid booking earned its operator, written in the same transaction that confirms the
 * booking. Amounts are in the fare currency and never change; a future refund adds its own entry.
 */
export const settlementEntries = pgTable(
  'settlement_entries',
  {
    id: uuid().primaryKey().defaultRandom(),
    organizationId: uuid()
      .notNull()
      .references(() => organizations.id, { onDelete: 'restrict' }),
    bookingId: uuid()
      .notNull()
      .references(() => bookings.id, { onDelete: 'restrict' }),
    seats: integer().notNull(),
    currency: currency().notNull(),
    gross: numeric({ precision: 12, scale: 2 }).notNull(),
    commissionRate: numeric({ precision: 5, scale: 2 }).notNull(),
    commission: numeric({ precision: 12, scale: 2 }).notNull(),
    earned: numeric({ precision: 12, scale: 2 }).notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // A booking is earned once, even if a provider reports the money twice.
    uniqueIndex('settlement_entries_booking_key').on(t.bookingId),
    index('settlement_entries_organization_idx').on(t.organizationId, t.createdAt),
  ],
);

/** Money the platform sent to an operator. Mistakes are voided, never edited or deleted. */
export const payouts = pgTable(
  'payouts',
  {
    id: uuid().primaryKey().defaultRandom(),
    organizationId: uuid()
      .notNull()
      .references(() => organizations.id, { onDelete: 'restrict' }),
    currency: currency().notNull(),
    amount: numeric({ precision: 12, scale: 2 }).notNull(),
    method: payoutMethod().notNull(),
    reference: text().notNull(),
    note: text(),
    createdByUserId: uuid().references(() => users.id, { onDelete: 'set null' }),
    voidedAt: timestamp({ withTimezone: true }),
    voidReason: text(),
    voidedByUserId: uuid().references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('payouts_organization_idx').on(t.organizationId, t.createdAt)],
);

export type SettlementEntryRow = typeof settlementEntries.$inferSelect;
export type PayoutRow = typeof payouts.$inferSelect;
