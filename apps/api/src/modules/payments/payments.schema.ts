import { sql } from 'drizzle-orm';
import {
  index,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import {
  PAYMENT_CURRENCIES,
  PAYMENT_METHODS,
  PAYMENT_STATUSES,
  RATE_CURRENCIES,
} from '@vtp/shared-types';
import { bookings } from '../bookings/bookings.schema.js';
import { timestamps, users } from '../identity/identity.schema.js';
import { organizations } from '../organizations/organizations.schema.js';

export const paymentMethod = pgEnum('payment_method', PAYMENT_METHODS);
export const paymentStatus = pgEnum('payment_status', PAYMENT_STATUSES);
export const paymentCurrency = pgEnum('payment_currency', PAYMENT_CURRENCIES);
export const rateCurrency = pgEnum('rate_currency', RATE_CURRENCIES);

/** Units of a currency per US dollar, set by each operator for its own fares. */
export const exchangeRates = pgTable(
  'exchange_rates',
  {
    organizationId: uuid()
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    currency: rateCurrency().notNull(),
    unitsPerUsd: numeric({ precision: 18, scale: 4 }).notNull(),
    updatedByUserId: uuid().references(() => users.id, { onDelete: 'set null' }),
    ...timestamps,
  },
  (t) => [primaryKey({ columns: [t.organizationId, t.currency] })],
);

/** One attempt to pay a booking with one method. The amount and rate are frozen at creation. */
export const payments = pgTable(
  'payments',
  {
    id: uuid().primaryKey().defaultRandom(),
    bookingId: uuid()
      .notNull()
      .references(() => bookings.id, { onDelete: 'restrict' }),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    method: paymentMethod().notNull(),
    status: paymentStatus().notNull().default('pending'),
    amount: numeric({ precision: 14, scale: 2 }).notNull(),
    currency: paymentCurrency().notNull(),
    /** Units of `currency` per unit of the fare currency; null when no conversion was needed. */
    rate: numeric({ precision: 18, scale: 6 }),
    /** Written by the payer in the transfer concept; matches incoming money to this payment. */
    reference: text().notNull(),
    /** Adapter that issued the instructions and confirms the payment (`simulated`, …). */
    provider: text().notNull(),
    instructions: jsonb().$type<{ label: string; value: string }[]>().notNull(),
    /** What the provider reported: its own id and the amount actually received. */
    providerReference: text(),
    receivedAmount: numeric({ precision: 14, scale: 2 }),
    expiresAt: timestamp({ withTimezone: true }),
    confirmedAt: timestamp({ withTimezone: true }),
    /** Set when platform staff send a `refund_due` payment back (`refunded`). */
    refundedAt: timestamp({ withTimezone: true }),
    refundReference: text(),
    refundedByUserId: uuid().references(() => users.id, { onDelete: 'set null' }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('payments_reference_key').on(t.reference),
    // A booking waits for at most one payment at a time.
    uniqueIndex('payments_booking_pending_key')
      .on(t.bookingId)
      .where(sql`${t.status} = 'pending'`),
    index('payments_booking_idx').on(t.bookingId),
    index('payments_status_idx').on(t.status),
  ],
);

export type ExchangeRateRow = typeof exchangeRates.$inferSelect;
export type PaymentRow = typeof payments.$inferSelect;
