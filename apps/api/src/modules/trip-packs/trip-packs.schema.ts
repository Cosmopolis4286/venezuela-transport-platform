import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
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
import { DEFAULT_TRIP_PACK_VALIDITY_DAYS, TRIP_PACK_STATUSES } from '@vtp/shared-types';
import { transportMode } from '../fleet/fleet.schema.js';
import { timestamps, users } from '../identity/identity.schema.js';
import { currency, operatingZones, stops } from '../network/network.schema.js';

export const tripPackStatus = pgEnum('trip_pack_status', TRIP_PACK_STATUSES);

/**
 * What the platform sells (ADR-028): trips on one stretch (`stopAId`–`stopBId`, both directions)
 * of a zone, in one kind of vehicle.
 */
export const tripPackProducts = pgTable(
  'trip_pack_products',
  {
    id: uuid().primaryKey().defaultRandom(),
    zoneId: uuid()
      .notNull()
      .references(() => operatingZones.id, { onDelete: 'restrict' }),
    stopAId: uuid()
      .notNull()
      .references(() => stops.id, { onDelete: 'restrict' }),
    stopBId: uuid()
      .notNull()
      .references(() => stops.id, { onDelete: 'restrict' }),
    mode: transportMode().notNull(),
    trips: integer().notNull(),
    price: numeric({ precision: 12, scale: 2 }).notNull(),
    currency: currency().notNull(),
    validityDays: integer().notNull().default(DEFAULT_TRIP_PACK_VALIDITY_DAYS),
    /** The most the platform pays an operator per trip used (pack currency); null: no cap. */
    maxFare: numeric({ precision: 12, scale: 2 }),
    active: boolean().notNull().default(true),
    updatedByUserId: uuid().references(() => users.id, { onDelete: 'set null' }),
    ...timestamps,
  },
  (t) => [
    index('trip_pack_products_zone_idx').on(t.zoneId, t.active),
    check('trip_pack_products_stops_check', sql`${t.stopAId} <> ${t.stopBId}`),
    check('trip_pack_products_trips_check', sql`${t.trips} between 2 and 100`),
    check('trip_pack_products_price_check', sql`${t.price} > 0`),
  ],
);

/** A pack someone bought. The product's terms are copied: later catalog changes never touch it. */
export const tripPacks = pgTable(
  'trip_packs',
  {
    id: uuid().primaryKey().defaultRandom(),
    code: text().notNull(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    productId: uuid()
      .notNull()
      .references(() => tripPackProducts.id, { onDelete: 'restrict' }),
    zoneId: uuid()
      .notNull()
      .references(() => operatingZones.id, { onDelete: 'restrict' }),
    stopAId: uuid()
      .notNull()
      .references(() => stops.id, { onDelete: 'restrict' }),
    stopBId: uuid()
      .notNull()
      .references(() => stops.id, { onDelete: 'restrict' }),
    mode: transportMode().notNull(),
    trips: integer().notNull(),
    /** Trips left; spent one per seat when booking (ADR-028). */
    remaining: integer().notNull(),
    price: numeric({ precision: 12, scale: 2 }).notNull(),
    currency: currency().notNull(),
    unitPrice: numeric({ precision: 12, scale: 2 }).notNull(),
    validityDays: integer().notNull(),
    /** Copied from the product at purchase. */
    maxFare: numeric({ precision: 12, scale: 2 }),
    status: tripPackStatus().notNull().default('pending_payment'),
    paymentDueAt: timestamp({ withTimezone: true }),
    activatedAt: timestamp({ withTimezone: true }),
    expiresAt: timestamp({ withTimezone: true }),
    /** When the passenger was reminded that it expires soon (once). */
    expiryNoticeSentAt: timestamp({ withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('trip_packs_code_key').on(t.code),
    index('trip_packs_user_idx').on(t.userId, t.createdAt),
    check('trip_packs_remaining_check', sql`${t.remaining} between 0 and ${t.trips}`),
  ],
);

export type TripPackProductRow = typeof tripPackProducts.$inferSelect;
export type TripPackRow = typeof tripPacks.$inferSelect;
