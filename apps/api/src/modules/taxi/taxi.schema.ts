import { sql } from 'drizzle-orm';
import {
  check,
  index,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { TAXI_DIRECTIONS, TAXI_RIDE_KINDS, TAXI_RIDE_STATUSES } from '@vtp/shared-types';
import { transportMode, vehicles } from '../fleet/fleet.schema.js';
import { timestamps, users } from '../identity/identity.schema.js';
import { currency, operatingZones, stops } from '../network/network.schema.js';
import { organizations } from '../organizations/organizations.schema.js';
import { tripPacks } from '../trip-packs/trip-packs.schema.js';

export const taxiDirection = pgEnum('taxi_direction', TAXI_DIRECTIONS);
export const taxiRideStatus = pgEnum('taxi_ride_status', TAXI_RIDE_STATUSES);
export const taxiRideKind = pgEnum('taxi_ride_kind', TAXI_RIDE_KINDS);

/**
 * A line's fixed fare to ride on demand between two stops of a zone, either way (ADR-028).
 * The stops are stored in id order (`stop_a_id < stop_b_id`) so each stretch has one row per mode.
 */
export const onDemandFares = pgTable(
  'on_demand_fares',
  {
    organizationId: uuid()
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
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
    amount: numeric({ precision: 12, scale: 2 }).notNull(),
    currency: currency().notNull(),
    ...timestamps,
  },
  (t) => [
    primaryKey({ columns: [t.organizationId, t.stopAId, t.stopBId, t.mode] }),
    index('on_demand_fares_stretch_idx').on(t.stopAId, t.stopBId, t.mode),
    check('on_demand_fares_order_check', sql`${t.stopAId} < ${t.stopBId}`),
    check('on_demand_fares_amount_check', sql`${t.amount} > 0`),
  ],
);

/** Terminals where a taxi line picks up and drops off passengers. */
export const taxiServiceAreas = pgTable(
  'taxi_service_areas',
  {
    organizationId: uuid()
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    stopId: uuid()
      .notNull()
      .references(() => stops.id, { onDelete: 'restrict' }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.organizationId, t.stopId] }),
    index('taxi_service_areas_stop_idx').on(t.stopId),
  ],
);

/** A taxi ride to or from a terminal. Line, driver, vehicle and fare are set when accepted. */
export const taxiRides = pgTable(
  'taxi_rides',
  {
    id: uuid().primaryKey().defaultRandom(),
    passengerUserId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    kind: taxiRideKind().notNull().default('terminal'),
    /** Terminal rides. */
    terminalStopId: uuid().references(() => stops.id, { onDelete: 'restrict' }),
    direction: taxiDirection(),
    /** Stretch rides (ADR-028): two stops of a zone, the vehicle, and maybe a set time. */
    fromStopId: uuid().references(() => stops.id, { onDelete: 'restrict' }),
    toStopId: uuid().references(() => stops.id, { onDelete: 'restrict' }),
    zoneId: uuid().references(() => operatingZones.id, { onDelete: 'restrict' }),
    mode: transportMode().notNull().default('car'),
    scheduledFor: timestamp({ withTimezone: true }),
    /** Stretch rides paid with this trip pack: one trip per passenger, spent when asked. */
    tripPackId: uuid().references(() => tripPacks.id, { onDelete: 'restrict' }),
    /** Paid with a pack: the code the passenger tells the driver at pickup (4 digits). */
    pickupCode: text(),
    pickupCodeAttempts: smallint().notNull().default(0),
    address: text().notNull(),
    notes: text(),
    passengers: smallint().notNull(),
    contactPhone: text(),
    status: taxiRideStatus().notNull().default('requested'),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    organizationId: uuid().references(() => organizations.id, { onDelete: 'restrict' }),
    driverUserId: uuid().references(() => users.id, { onDelete: 'restrict' }),
    vehicleId: uuid().references(() => vehicles.id, { onDelete: 'restrict' }),
    fareAmount: numeric({ precision: 12, scale: 2 }),
    fareCurrency: currency(),
    acceptedAt: timestamp({ withTimezone: true }),
    pickedUpAt: timestamp({ withTimezone: true }),
    completedAt: timestamp({ withTimezone: true }),
    cancelledAt: timestamp({ withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    // One open ride per passenger, one active ride per driver and per vehicle.
    uniqueIndex('taxi_rides_passenger_open_key')
      .on(t.passengerUserId)
      .where(sql`${t.status} in ('requested', 'accepted', 'in_progress')`),
    // A ride booked for later does not keep its driver or vehicle busy until pickup.
    uniqueIndex('taxi_rides_driver_active_key')
      .on(t.driverUserId)
      .where(
        sql`${t.status} = 'in_progress' or (${t.status} = 'accepted' and ${t.scheduledFor} is null)`,
      ),
    uniqueIndex('taxi_rides_vehicle_active_key')
      .on(t.vehicleId)
      .where(
        sql`${t.status} = 'in_progress' or (${t.status} = 'accepted' and ${t.scheduledFor} is null)`,
      ),
    index('taxi_rides_terminal_status_idx').on(t.terminalStopId, t.status, t.createdAt),
    index('taxi_rides_organization_idx').on(t.organizationId, t.createdAt),
    index('taxi_rides_passenger_idx').on(t.passengerUserId, t.createdAt),
    index('taxi_rides_stretch_status_idx').on(t.fromStopId, t.toStopId, t.status),
    check('taxi_rides_passengers_check', sql`${t.passengers} between 1 and 6`),
    check(
      'taxi_rides_kind_check',
      sql`(${t.kind} = 'terminal' and ${t.terminalStopId} is not null and ${t.direction} is not null) or (${t.kind} = 'stretch' and ${t.fromStopId} is not null and ${t.toStopId} is not null and ${t.zoneId} is not null)`,
    ),
    check(
      'taxi_rides_taken_check',
      // Taken rides always name the line, driver, vehicle and fare.
      sql`${t.status} in ('requested', 'expired', 'cancelled') or (${t.organizationId} is not null and ${t.driverUserId} is not null and ${t.vehicleId} is not null and ${t.fareAmount} is not null and ${t.fareCurrency} is not null)`,
    ),
  ],
);

/**
 * A stretch ride the passenger cancelled late, after a line took it: they owe the line part of
 * its fare, paid in cash to the driver of their next taxi or motorcycle ride. `charged_ride_id`
 * is that ride, set when it is completed (the ledger records it then).
 */
export const rideCancellationFees = pgTable(
  'ride_cancellation_fees',
  {
    id: uuid().primaryKey().defaultRandom(),
    cancelledRideId: uuid()
      .notNull()
      .unique()
      .references(() => taxiRides.id, { onDelete: 'restrict' }),
    passengerUserId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    /** The line that went out: the fee is its. */
    organizationId: uuid()
      .notNull()
      .references(() => organizations.id, { onDelete: 'restrict' }),
    amount: numeric({ precision: 12, scale: 2 }).notNull(),
    currency: currency().notNull(),
    chargedRideId: uuid().references(() => taxiRides.id, { onDelete: 'restrict' }),
    chargedAt: timestamp({ withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('ride_cancellation_fees_pending_idx')
      .on(t.passengerUserId)
      .where(sql`${t.chargedAt} is null`),
    check('ride_cancellation_fees_amount_check', sql`${t.amount} > 0`),
    check(
      'ride_cancellation_fees_charged_check',
      sql`(${t.chargedAt} is null) = (${t.chargedRideId} is null)`,
    ),
  ],
);

export type TaxiRideRow = typeof taxiRides.$inferSelect;
export type OnDemandFareRow = typeof onDemandFares.$inferSelect;
export type RideCancellationFeeRow = typeof rideCancellationFees.$inferSelect;
