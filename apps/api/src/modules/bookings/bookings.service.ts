import { randomInt } from 'node:crypto';
import { HttpStatus, Injectable } from '@nestjs/common';
import {
  MAX_SEATS_PER_BOOKING,
  NETWORK_UTC_OFFSET,
  type Booking,
  type CreateBookingRequest,
  type TripManifest,
  type TripSummary,
} from '@vtp/shared-types';
import { and, asc, count, desc, eq, gt, inArray, sql } from 'drizzle-orm';
import { ApiException } from '../../common/errors/api.exception.js';
import { DatabaseService } from '../../database/database.service.js';
import { AppConfigService } from '../../config/app-config.service.js';
import { AuditService } from '../audit/audit.service.js';
import type { Authenticated, RequestMeta } from '../identity/sessions.service.js';
import { routes, routeSchedules } from '../network/network.schema.js';
import { StopsService } from '../network/stops.service.js';
import type { OrganizationAccess } from '../organizations/organization-access.js';
import { organizations } from '../organizations/organizations.schema.js';
import {
  bookingPassengers,
  bookings,
  trips,
  type BookingPassengerRow,
  type BookingRow,
  type TripRow,
} from './bookings.schema.js';
import { expireHolds, occupiesSeat } from './occupancy.js';
import { compareSeats, isBookable, seatNumbersOf, TripsService } from './trips.service.js';

/** A person may keep a few unpaid holds at once, so seats cannot be hoarded. */
const MAX_ACTIVE_HOLDS_PER_USER = 3;
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

const conflict = (message: string) => new ApiException('CONFLICT', message, HttpStatus.CONFLICT);
const invalid = (message: string) =>
  new ApiException('VALIDATION_FAILED', message, HttpStatus.BAD_REQUEST);
const notFound = (message = 'Booking not found') =>
  new ApiException('NOT_FOUND', message, HttpStatus.NOT_FOUND);

const uniqueViolation = (error: unknown): string | undefined => {
  const cause = (error as { cause?: { code?: string; constraint?: string } }).cause ?? error;
  const pg = cause as { code?: string; constraint?: string };
  return pg.code === '23505' ? (pg.constraint ?? 'unique') : undefined;
};

/** `2026-10-20T21:30:00-04:00` for an instant. */
export function toLocalIso(instant: Date): string {
  return `${new Date(instant.getTime() - 4 * 3600_000).toISOString().slice(0, 19)}${NETWORK_UTC_OFFSET}`;
}

function bookingCode(): string {
  let code = '';
  for (let i = 0; i < 6; i++) code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return `VTP-${code}`;
}

const cents = (amount: string) => Math.round(Number(amount) * 100);
const fromCents = (value: number) => (value / 100).toFixed(2);

@Injectable()
export class BookingsService {
  constructor(
    private readonly database: DatabaseService,
    private readonly trips: TripsService,
    private readonly stops: StopsService,
    private readonly audit: AuditService,
    private readonly config: AppConfigService,
  ) {}

  /** Holds the seats for `BOOKING_HOLD_MINUTES`; payment confirms the booking. */
  async create(
    auth: Authenticated,
    input: CreateBookingRequest,
    meta: RequestMeta,
  ): Promise<Booking> {
    const seats = input.passengers.map((p) => p.seatNumber.trim().toUpperCase());
    if (!seats.length || seats.length > MAX_SEATS_PER_BOOKING) {
      throw invalid(`Book between 1 and ${MAX_SEATS_PER_BOOKING} seats`);
    }
    if (new Set(seats).size !== seats.length) throw invalid('Each seat can be chosen only once');

    const context = await this.trips.resolve(
      input.scheduleId,
      input.serviceDate,
      input.fromStopId,
      input.toStopId,
    );
    if (!context.fare) throw conflict('This trip cannot be booked online yet');
    if (!isBookable(context)) throw conflict('This departure has already left');
    const fare = context.fare;

    const [{ active }] = (await this.database.db
      .select({ active: count() })
      .from(bookings)
      .where(
        and(
          eq(bookings.userId, auth.user.id),
          eq(bookings.status, 'held'),
          gt(bookings.expiresAt, sql`now()`),
        ),
      )) as [{ active: number }];
    if (active >= MAX_ACTIVE_HOLDS_PER_USER) {
      throw conflict('Pay or cancel your pending bookings before holding more seats');
    }

    const holdMinutes = this.config.get('BOOKING_HOLD_MINUTES');
    const total = fromCents(cents(fare.amount) * seats.length);
    let booking: BookingRow | undefined;
    for (let attempt = 0; !booking && attempt < 3; attempt++) {
      try {
        booking = await this.database.db.transaction(async (tx) => {
          const trip = await this.trips.getOrCreate(tx, context);
          if (trip.status !== 'scheduled') throw conflict('This departure was cancelled');
          const valid = seatNumbersOf(trip);
          const unknown = seats.find((seat) => !valid.has(seat));
          if (unknown) throw invalid(`Seat ${unknown} does not exist on this vehicle`);
          await expireHolds(tx, trip.id);

          const [row] = await tx
            .insert(bookings)
            .values({
              code: bookingCode(),
              tripId: trip.id,
              userId: auth.user.id,
              fromStopId: input.fromStopId,
              toStopId: input.toStopId,
              departsAt: new Date(context.occurrence.departsAt),
              arrivesAt: new Date(context.occurrence.arrivesAt),
              fareAmount: fare.amount,
              totalAmount: total,
              currency: fare.currency,
              expiresAt: sql`now() + make_interval(mins => ${holdMinutes})`,
            })
            .returning();
          // The partial unique index on (trip, seat) rejects seats another booking holds.
          await tx.insert(bookingPassengers).values(
            input.passengers.map((passenger, index) => ({
              bookingId: row!.id,
              tripId: trip.id,
              seatNumber: seats[index]!,
              firstName: passenger.firstName.trim(),
              lastName: passenger.lastName.trim(),
              documentType: passenger.documentType,
              documentNumber: passenger.documentNumber.replace(/[\s.-]/g, '').toUpperCase(),
            })),
          );
          return row!;
        });
      } catch (error) {
        const constraint = uniqueViolation(error);
        if (constraint === 'booking_passengers_active_seat_key') {
          throw conflict('One of the seats was just taken, choose another');
        }
        if (constraint !== 'bookings_code_key') throw error;
        // Code collision: retry with a new code.
      }
    }
    if (!booking) throw new Error('Could not generate a unique booking code');
    await this.audit.record({
      action: 'booking.held',
      actorUserId: auth.user.id,
      targetType: 'booking',
      targetId: booking.id,
      ip: meta.ip,
      metadata: { tripId: booking.tripId, seats: seats.length },
    });
    return (await this.toBookings([booking]))[0]!;
  }

  async listMine(userId: string): Promise<Booking[]> {
    await expireHolds(this.database.db);
    const rows = await this.database.db
      .select()
      .from(bookings)
      .where(eq(bookings.userId, userId))
      .orderBy(desc(bookings.createdAt))
      .limit(50);
    return this.toBookings(rows);
  }

  async getMine(userId: string, bookingId: string): Promise<Booking> {
    return (await this.toBookings([await this.requireMine(userId, bookingId)]))[0]!;
  }

  /** Releases the seats of a held booking. Paid bookings are cancelled through refunds (payments). */
  async cancelMine(auth: Authenticated, bookingId: string, meta: RequestMeta): Promise<Booking> {
    const booking = await this.requireMine(auth.user.id, bookingId);
    if (booking.status !== 'held')
      throw conflict(`A ${booking.status} booking cannot be cancelled here`);
    const cancelled = await this.database.db.transaction(async (tx) => {
      const [row] = await tx
        .update(bookings)
        .set({ status: 'cancelled', cancelledAt: new Date(), expiresAt: null })
        .where(and(eq(bookings.id, booking.id), eq(bookings.status, 'held')))
        .returning();
      if (!row) throw conflict('The booking changed, reload and retry');
      await tx
        .update(bookingPassengers)
        .set({ active: false })
        .where(eq(bookingPassengers.bookingId, booking.id));
      return row;
    });
    await this.audit.record({
      action: 'booking.cancelled',
      actorUserId: auth.user.id,
      targetType: 'booking',
      targetId: booking.id,
      ip: meta.ip,
    });
    return (await this.toBookings([cancelled]))[0]!;
  }

  /** Trips of an organization on a service date, with seat counts. */
  async tripsOn(organizationId: string, serviceDate: string): Promise<TripSummary[]> {
    const rows = await this.database.db
      .select({
        trip: trips,
        route: { id: routes.id, name: routes.name },
        serviceClass: routeSchedules.serviceClass,
      })
      .from(trips)
      .innerJoin(routes, eq(routes.id, trips.routeId))
      .innerJoin(routeSchedules, eq(routeSchedules.id, trips.scheduleId))
      .where(and(eq(trips.organizationId, organizationId), eq(trips.serviceDate, serviceDate)))
      .orderBy(asc(trips.departsAt));
    const counts = rows.length
      ? await this.database.db
          .select({ tripId: bookingPassengers.tripId, status: bookings.status, seats: count() })
          .from(bookingPassengers)
          .innerJoin(bookings, and(eq(bookings.id, bookingPassengers.bookingId), occupiesSeat()))
          .where(
            and(
              inArray(
                bookingPassengers.tripId,
                rows.map((r) => r.trip.id),
              ),
              eq(bookingPassengers.active, true),
            ),
          )
          .groupBy(bookingPassengers.tripId, bookings.status)
      : [];
    return rows.map(({ trip, route, serviceClass }) => summary(trip, route, serviceClass, counts));
  }

  async manifest(access: OrganizationAccess, tripId: string): Promise<TripManifest> {
    const [row] = await this.database.db
      .select({
        trip: trips,
        route: { id: routes.id, name: routes.name },
        serviceClass: routeSchedules.serviceClass,
      })
      .from(trips)
      .innerJoin(routes, eq(routes.id, trips.routeId))
      .innerJoin(routeSchedules, eq(routeSchedules.id, trips.scheduleId))
      .where(and(eq(trips.id, tripId), eq(trips.organizationId, access.organization.id)));
    if (!row) throw notFound('Trip not found');
    const passengers = await this.database.db
      .select({ passenger: bookingPassengers, booking: bookings })
      .from(bookingPassengers)
      .innerJoin(bookings, and(eq(bookings.id, bookingPassengers.bookingId), occupiesSeat()))
      .where(and(eq(bookingPassengers.tripId, tripId), eq(bookingPassengers.active, true)));
    const stops = await this.stops.summaries([
      ...new Set(passengers.flatMap(({ booking }) => [booking.fromStopId, booking.toStopId])),
    ]);
    const counts = Object.entries(
      passengers.reduce<Record<string, number>>((acc, { booking }) => {
        acc[booking.status] = (acc[booking.status] ?? 0) + 1;
        return acc;
      }, {}),
    ).map(([status, seats]) => ({ tripId, status: status as BookingRow['status'], seats }));
    return {
      ...summary(row.trip, row.route, row.serviceClass, counts),
      passengers: passengers
        .map(({ passenger, booking }) => ({
          seatNumber: passenger.seatNumber,
          firstName: passenger.firstName,
          lastName: passenger.lastName,
          documentType: passenger.documentType,
          documentNumber: passenger.documentNumber,
          bookingCode: booking.code,
          bookingStatus: booking.status,
          from: stops.get(booking.fromStopId)!,
          to: stops.get(booking.toStopId)!,
        }))
        .sort((a, b) => compareSeats(a.seatNumber, b.seatNumber)),
    };
  }

  private async requireMine(userId: string, bookingId: string): Promise<BookingRow> {
    await expireHolds(this.database.db);
    const [booking] = await this.database.db
      .select()
      .from(bookings)
      .where(and(eq(bookings.id, bookingId), eq(bookings.userId, userId)));
    if (!booking) throw notFound();
    return booking;
  }

  private async toBookings(rows: BookingRow[]): Promise<Booking[]> {
    if (!rows.length) return [];
    const tripRows = await this.database.db
      .select({
        trip: trips,
        route: { id: routes.id, name: routes.name },
        serviceClass: routeSchedules.serviceClass,
        operator: {
          id: organizations.id,
          type: organizations.type,
          legalName: organizations.legalName,
          tradeName: organizations.tradeName,
        },
      })
      .from(trips)
      .innerJoin(routes, eq(routes.id, trips.routeId))
      .innerJoin(routeSchedules, eq(routeSchedules.id, trips.scheduleId))
      .innerJoin(organizations, eq(organizations.id, trips.organizationId))
      .where(inArray(trips.id, [...new Set(rows.map((b) => b.tripId))]));
    const passengers = await this.database.db
      .select()
      .from(bookingPassengers)
      .where(
        inArray(
          bookingPassengers.bookingId,
          rows.map((b) => b.id),
        ),
      );
    const stops = await this.stops.summaries([
      ...new Set(rows.flatMap((b) => [b.fromStopId, b.toStopId])),
    ]);
    return rows.map((booking) => {
      const trip = tripRows.find((t) => t.trip.id === booking.tripId)!;
      return {
        id: booking.id,
        code: booking.code,
        status: booking.status,
        trip: {
          id: trip.trip.id,
          scheduleId: trip.trip.scheduleId,
          serviceDate: trip.trip.serviceDate,
          departsAt: toLocalIso(booking.departsAt),
          arrivesAt: toLocalIso(booking.arrivesAt),
          serviceClass: trip.serviceClass,
        },
        operator: trip.operator,
        route: trip.route,
        from: stops.get(booking.fromStopId)!,
        to: stops.get(booking.toStopId)!,
        passengers: passengers
          .filter((p) => p.bookingId === booking.id)
          .sort((a, b) => compareSeats(a.seatNumber, b.seatNumber))
          .map((p: BookingPassengerRow) => ({
            seatNumber: p.seatNumber,
            firstName: p.firstName,
            lastName: p.lastName,
            documentType: p.documentType,
            documentNumber: p.documentNumber,
            fare: booking.fareAmount,
          })),
        total: { amount: booking.totalAmount, currency: booking.currency },
        expiresAt:
          booking.status === 'held' && booking.expiresAt ? booking.expiresAt.toISOString() : null,
        createdAt: booking.createdAt.toISOString(),
      };
    });
  }
}

function summary(
  trip: TripRow,
  route: { id: string; name: string },
  serviceClass: TripSummary['serviceClass'],
  counts: { tripId: string; status: BookingRow['status']; seats: number }[],
): TripSummary {
  const seatsWith = (status: BookingRow['status']) =>
    counts
      .filter((c) => c.tripId === trip.id && c.status === status)
      .reduce((n, c) => n + c.seats, 0);
  return {
    id: trip.id,
    scheduleId: trip.scheduleId,
    serviceDate: trip.serviceDate,
    route,
    departureTime: toLocalIso(trip.departsAt).slice(11, 16),
    serviceClass,
    capacity: trip.capacity,
    soldSeats: seatsWith('confirmed'),
    heldSeats: seatsWith('held'),
  };
}
