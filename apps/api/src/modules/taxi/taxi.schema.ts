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
import { TAXI_DIRECTIONS, TAXI_RIDE_STATUSES } from '@vtp/shared-types';
import { vehicles } from '../fleet/fleet.schema.js';
import { timestamps, users } from '../identity/identity.schema.js';
import { currency, stops } from '../network/network.schema.js';
import { organizations } from '../organizations/organizations.schema.js';

export const taxiDirection = pgEnum('taxi_direction', TAXI_DIRECTIONS);
export const taxiRideStatus = pgEnum('taxi_ride_status', TAXI_RIDE_STATUSES);

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
    terminalStopId: uuid()
      .notNull()
      .references(() => stops.id, { onDelete: 'restrict' }),
    direction: taxiDirection().notNull(),
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
    uniqueIndex('taxi_rides_driver_active_key')
      .on(t.driverUserId)
      .where(sql`${t.status} in ('accepted', 'in_progress')`),
    uniqueIndex('taxi_rides_vehicle_active_key')
      .on(t.vehicleId)
      .where(sql`${t.status} in ('accepted', 'in_progress')`),
    index('taxi_rides_terminal_status_idx').on(t.terminalStopId, t.status, t.createdAt),
    index('taxi_rides_organization_idx').on(t.organizationId, t.createdAt),
    index('taxi_rides_passenger_idx').on(t.passengerUserId, t.createdAt),
    check('taxi_rides_passengers_check', sql`${t.passengers} between 1 and 6`),
    check(
      'taxi_rides_taken_check',
      // Taken rides always name the line, driver, vehicle and fare.
      sql`${t.status} in ('requested', 'expired', 'cancelled') or (${t.organizationId} is not null and ${t.driverUserId} is not null and ${t.vehicleId} is not null and ${t.fareAmount} is not null and ${t.fareCurrency} is not null)`,
    ),
  ],
);

export type TaxiRideRow = typeof taxiRides.$inferSelect;
