import { sql } from 'drizzle-orm';
import {
  check,
  date,
  index,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { users } from '../identity/identity.schema.js';
import { currency, routes, stops } from '../network/network.schema.js';
import { organizations } from '../organizations/organizations.schema.js';

/**
 * Passengers who paid a driver in cash (ADR-033), for reports only: the amount is the published
 * fare × passengers, there is no service fee and nothing is settled.
 */
export const cashSales = pgTable(
  'cash_sales',
  {
    id: uuid().primaryKey().defaultRandom(),
    organizationId: uuid()
      .notNull()
      .references(() => organizations.id, { onDelete: 'restrict' }),
    routeId: uuid()
      .notNull()
      .references(() => routes.id, { onDelete: 'restrict' }),
    fromStopId: uuid()
      .notNull()
      .references(() => stops.id, { onDelete: 'restrict' }),
    toStopId: uuid()
      .notNull()
      .references(() => stops.id, { onDelete: 'restrict' }),
    passengers: integer().notNull(),
    amount: numeric({ precision: 12, scale: 2 }).notNull(),
    currency: currency().notNull(),
    /** Venezuelan calendar day. */
    serviceDate: date({ mode: 'string' }).notNull(),
    driverUserId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    voidedAt: timestamp({ withTimezone: true }),
    voidReason: text(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check('cash_sales_passengers_check', sql`${t.passengers} between 1 and 60`),
    index('cash_sales_organization_date_idx').on(t.organizationId, t.serviceDate),
    index('cash_sales_driver_date_idx').on(t.driverUserId, t.serviceDate),
  ],
);

export type CashSaleRow = typeof cashSales.$inferSelect;
