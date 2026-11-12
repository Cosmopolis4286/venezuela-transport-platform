import { sql } from 'drizzle-orm';
import {
  check,
  date,
  index,
  integer,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';
import {
  BUYER_ID_TYPES,
  INVOICE_KINDS,
  INVOICE_REASONS,
  INVOICE_STATUSES,
  TAXPAYER_TYPES,
} from '@vtp/shared-types';
import { bookings } from '../bookings/bookings.schema.js';
import { timestamps, users } from '../identity/identity.schema.js';
import { currency } from '../network/network.schema.js';
import { organizations } from '../organizations/organizations.schema.js';

export const taxpayerType = pgEnum('taxpayer_type', TAXPAYER_TYPES);
export const invoiceKind = pgEnum('invoice_kind', INVOICE_KINDS);
export const invoiceReason = pgEnum('invoice_reason', INVOICE_REASONS);
export const invoiceStatus = pgEnum('invoice_status', INVOICE_STATUSES);
export const buyerIdType = pgEnum('buyer_id_type', BUYER_ID_TYPES);

/** Who the platform invoices as (ADR-031). A single row (`id = 1`), edited by admins. */
export const fiscalSettings = pgTable(
  'fiscal_settings',
  {
    id: integer().primaryKey().default(1),
    legalName: text().notNull(),
    rif: text().notNull(),
    fiscalAddress: text().notNull(),
    taxpayerType: taxpayerType().notNull(),
    /** Percentage included in the service fee, e.g. 16.00. */
    vatRate: numeric({ precision: 5, scale: 2 }).notNull(),
    updatedByUserId: uuid().references(() => users.id, { onDelete: 'set null' }),
    ...timestamps,
  },
  (t) => [check('fiscal_settings_single_row', sql`${t.id} = 1`)],
);

/** The BCV official rate per day, entered by staff; documents in dollars are converted with it. */
export const bcvRates = pgTable('bcv_rates', {
  date: date().primaryKey(),
  unitsPerUsd: numeric({ precision: 18, scale: 6 }).notNull(),
  updatedByUserId: uuid().references(() => users.id, { onDelete: 'set null' }),
  ...timestamps,
});

/**
 * Service-fee invoices and credit notes (ADR-031). A draft is created with the booking's money;
 * issuing it fixes its numbers, date and bolívar amounts, which never change afterwards.
 */
export const invoices = pgTable(
  'invoices',
  {
    id: uuid().primaryKey().defaultRandom(),
    kind: invoiceKind().notNull(),
    reason: invoiceReason().notNull(),
    status: invoiceStatus().notNull().default('draft'),
    bookingId: uuid()
      .notNull()
      .references(() => bookings.id, { onDelete: 'restrict' }),
    relatedInvoiceId: uuid().references((): AnyPgColumn => invoices.id, { onDelete: 'restrict' }),
    /** Set when the buyer is an operator (it bore the fee of a departure it cancelled). */
    buyerOrganizationId: uuid().references(() => organizations.id, { onDelete: 'restrict' }),
    buyerName: text().notNull(),
    buyerIdType: buyerIdType().notNull(),
    buyerIdNumber: text().notNull(),
    buyerAddress: text(),
    description: text().notNull(),
    /** The fee, VAT included, in the booking's currency. */
    amount: numeric({ precision: 12, scale: 2 }).notNull(),
    currency: currency().notNull(),
    // Fixed when issued.
    number: text(),
    controlNumber: text(),
    issuedOn: date(),
    issuerReference: text(),
    taxpayerType: taxpayerType(),
    exchangeRate: numeric({ precision: 18, scale: 6 }),
    vatRate: numeric({ precision: 5, scale: 2 }),
    baseVes: numeric({ precision: 16, scale: 2 }),
    notTaxedVes: numeric({ precision: 16, scale: 2 }),
    vatVes: numeric({ precision: 16, scale: 2 }),
    totalVes: numeric({ precision: 16, scale: 2 }),
    issuedByUserId: uuid().references(() => users.id, { onDelete: 'set null' }),
    voidedAt: timestamp({ withTimezone: true }),
    voidReason: text(),
    voidedByUserId: uuid().references(() => users.id, { onDelete: 'set null' }),
    ...timestamps,
  },
  (t) => [
    // One document per booking and reason, however many times the money is reported.
    uniqueIndex('invoices_booking_reason_key').on(t.bookingId, t.reason),
    uniqueIndex('invoices_kind_number_key')
      .on(t.kind, t.number)
      .where(sql`${t.number} is not null`),
    uniqueIndex('invoices_control_number_key')
      .on(t.controlNumber)
      .where(sql`${t.controlNumber} is not null`),
    index('invoices_status_idx').on(t.status, t.createdAt),
    index('invoices_issued_on_idx').on(t.issuedOn),
  ],
);

/** Invoices the platform received from its suppliers, for the purchases book. */
export const purchases = pgTable(
  'purchases',
  {
    id: uuid().primaryKey().defaultRandom(),
    date: date().notNull(),
    supplierRif: text().notNull(),
    supplierName: text().notNull(),
    invoiceNumber: text().notNull(),
    controlNumber: text().notNull(),
    base: numeric({ precision: 16, scale: 2 }).notNull(),
    exempt: numeric({ precision: 16, scale: 2 }).notNull(),
    vatRate: numeric({ precision: 5, scale: 2 }).notNull(),
    vat: numeric({ precision: 16, scale: 2 }).notNull(),
    total: numeric({ precision: 16, scale: 2 }).notNull(),
    createdByUserId: uuid().references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('purchases_supplier_invoice_key').on(t.supplierRif, t.invoiceNumber),
    index('purchases_date_idx').on(t.date),
  ],
);

export type InvoiceRow = typeof invoices.$inferSelect;
export type PurchaseRow = typeof purchases.$inferSelect;
