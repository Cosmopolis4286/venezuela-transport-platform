import { sql } from 'drizzle-orm';
import {
  check,
  index,
  jsonb,
  integer,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { PAYOUT_METHODS, type RefundTier } from '@vtp/shared-types';
import { bookings } from '../bookings/bookings.schema.js';
import { timestamps, users } from '../identity/identity.schema.js';
import { currency } from '../network/network.schema.js';
import { organizations } from '../organizations/organizations.schema.js';

export const payoutMethod = pgEnum('payout_method', PAYOUT_METHODS);
export const settlementEntryKind = pgEnum('settlement_entry_kind', ['booking', 'cancellation']);

/** The platform's defaults, editable by platform admins. A single row (`id = 1`). */
export const platformSettings = pgTable(
  'platform_settings',
  {
    id: integer().primaryKey().default(1),
    /** Percentage, e.g. 8.00. */
    commissionRate: numeric({ precision: 5, scale: 2 }).notNull(),
    refundTiers: jsonb().$type<RefundTier[]>().notNull(),
    updatedByUserId: uuid().references(() => users.id, { onDelete: 'set null' }),
    ...timestamps,
  },
  (t) => [check('platform_settings_single_row', sql`${t.id} = 1`)],
);

/** What one operator agreed with the platform; null fields use the platform's defaults. */
export const organizationPolicies = pgTable('organization_policies', {
  organizationId: uuid()
    .primaryKey()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  commissionRate: numeric({ precision: 5, scale: 2 }),
  refundTiers: jsonb().$type<RefundTier[]>(),
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
    /** `booking` when it was paid; `cancellation` (negative amounts) when the passenger cancelled. */
    kind: settlementEntryKind().notNull().default('booking'),
    seats: integer().notNull(),
    currency: currency().notNull(),
    gross: numeric({ precision: 12, scale: 2 }).notNull(),
    commissionRate: numeric({ precision: 5, scale: 2 }).notNull(),
    commission: numeric({ precision: 12, scale: 2 }).notNull(),
    earned: numeric({ precision: 12, scale: 2 }).notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // A booking is earned once, even if a provider reports the money twice, and cancelled once.
    uniqueIndex('settlement_entries_booking_kind_key').on(t.bookingId, t.kind),
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
