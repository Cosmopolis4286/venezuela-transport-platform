import { sql } from 'drizzle-orm';
import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { BOOKING_STATUSES, type LayoutSeat } from '@vtp/shared-types';
import { timestamps, users } from '../identity/identity.schema.js';
import { currency, routes, routeSchedules, stops } from '../network/network.schema.js';
import { vehicles } from '../fleet/fleet.schema.js';
import { identityDocumentType } from '../onboarding/onboarding.schema.js';
import { organizations } from '../organizations/organizations.schema.js';

export const bookingStatus = pgEnum('booking_status', BOOKING_STATUSES);
export const tripStatus = pgEnum('trip_status', ['scheduled', 'cancelled']);

export type TripLayout = { decks: number; rows: number; columns: number; seats: LayoutSeat[] };

/** One schedule on one service date, created on the first booking. */
export const trips = pgTable(
  'trips',
  {
    id: uuid().primaryKey().defaultRandom(),
    // Restrict: a schedule with trips is paused, not deleted, so bookings keep their trip.
    scheduleId: uuid()
      .notNull()
      .references(() => routeSchedules.id, { onDelete: 'restrict' }),
    routeId: uuid()
      .notNull()
      .references(() => routes.id, { onDelete: 'restrict' }),
    organizationId: uuid()
      .notNull()
      .references(() => organizations.id, { onDelete: 'restrict' }),
    /** Date the vehicle leaves the route's origin. */
    serviceDate: date({ mode: 'string' }).notNull(),
    /** Departure from the origin. */
    departsAt: timestamp({ withTimezone: true }).notNull(),
    /** Seat map at the time of the first booking; null for schedules with only a seat count. */
    layout: jsonb().$type<TripLayout>(),
    capacity: integer().notNull(),
    status: tripStatus().notNull().default('scheduled'),
    /** Assigned by a dispatcher (`operations.dispatch`). */
    vehicleId: uuid().references(() => vehicles.id, { onDelete: 'restrict' }),
    driverUserId: uuid().references(() => users.id, { onDelete: 'restrict' }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('trips_schedule_date_key').on(t.scheduleId, t.serviceDate),
    index('trips_organization_date_idx').on(t.organizationId, t.serviceDate),
    index('trips_vehicle_departs_idx').on(t.vehicleId, t.departsAt),
    index('trips_driver_departs_idx').on(t.driverUserId, t.departsAt),
  ],
);

export const bookings = pgTable(
  'bookings',
  {
    id: uuid().primaryKey().defaultRandom(),
    code: text().notNull(),
    tripId: uuid()
      .notNull()
      .references(() => trips.id, { onDelete: 'restrict' }),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    fromStopId: uuid()
      .notNull()
      .references(() => stops.id, { onDelete: 'restrict' }),
    toStopId: uuid()
      .notNull()
      .references(() => stops.id, { onDelete: 'restrict' }),
    status: bookingStatus().notNull().default('held'),
    /** Boarding and arrival times of this passenger's segment, frozen at booking. */
    departsAt: timestamp({ withTimezone: true }).notNull(),
    arrivesAt: timestamp({ withTimezone: true }).notNull(),
    /** Fare per passenger and total, frozen when the seats were held. */
    fareAmount: numeric({ precision: 12, scale: 2 }).notNull(),
    totalAmount: numeric({ precision: 12, scale: 2 }).notNull(),
    currency: currency().notNull(),
    expiresAt: timestamp({ withTimezone: true }),
    confirmedAt: timestamp({ withTimezone: true }),
    cancelledAt: timestamp({ withTimezone: true }),
    /** Set when the passenger got the trip reminder (notifications), so it is sent once. */
    reminderSentAt: timestamp({ withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('bookings_code_key').on(t.code),
    index('bookings_user_idx').on(t.userId, t.createdAt),
    index('bookings_trip_status_idx').on(t.tripId, t.status),
  ],
);

/** One row per seat. `active` is cleared when the booking is cancelled or expires. */
export const bookingPassengers = pgTable(
  'booking_passengers',
  {
    id: uuid().primaryKey().defaultRandom(),
    bookingId: uuid()
      .notNull()
      .references(() => bookings.id, { onDelete: 'cascade' }),
    tripId: uuid()
      .notNull()
      .references(() => trips.id, { onDelete: 'restrict' }),
    seatNumber: text().notNull(),
    firstName: text().notNull(),
    lastName: text().notNull(),
    documentType: identityDocumentType().notNull(),
    documentNumber: text().notNull(),
    active: boolean().notNull().default(true),
    /** Set when the ticket is scanned at boarding. */
    boardedAt: timestamp({ withTimezone: true }),
    boardedByUserId: uuid().references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // The guarantee against selling a seat twice.
    uniqueIndex('booking_passengers_active_seat_key')
      .on(t.tripId, t.seatNumber)
      .where(sql`${t.active}`),
    index('booking_passengers_booking_idx').on(t.bookingId),
  ],
);

export type TripRow = typeof trips.$inferSelect;
export type BookingRow = typeof bookings.$inferSelect;
export type BookingPassengerRow = typeof bookingPassengers.$inferSelect;
