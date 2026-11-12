import { randomInt } from 'node:crypto';
import { HttpStatus, Injectable } from '@nestjs/common';
import {
  BUYER_ID_TYPES,
  formatPaymentAmount,
  MAX_SEATS_PER_BOOKING,
  TICKET_QR_PREFIX,
  toNetworkIso,
  refundPercentFor,
  type AdminBookingLookup,
  type Booking,
  type CancelDepartureResult,
  type CancellationQuote,
  type CreateBookingRequest,
  type InvoiceBuyer,
  type RefundTier,
  type TripManifest,
  type TripSummary,
} from '@vtp/shared-types';
import { and, asc, count, desc, eq, gt, inArray, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { ApiException } from '../../common/errors/api.exception.js';
import {
  DatabaseService,
  type Database,
  type Transaction,
} from '../../database/database.service.js';
import { AppConfigService } from '../../config/app-config.service.js';
import { AuditService } from '../audit/audit.service.js';
import { applyBilling, correctFeeInvoice } from '../fiscal/fiscal-ledger.js';
import { invoices } from '../fiscal/fiscal.schema.js';
import { vehicles } from '../fleet/fleet.schema.js';
import { users } from '../identity/identity.schema.js';
import type { Authenticated, RequestMeta } from '../identity/sessions.service.js';
import { routes, routeSchedules } from '../network/network.schema.js';
import { StopsService } from '../network/stops.service.js';
import { organizations } from '../organizations/organizations.schema.js';
import { currentPayment, toPayment } from '../payments/payment-view.js';
import { departureText } from '../notifications/format.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { payments, type PaymentRow } from '../payments/payments.schema.js';
import {
  commissionFor,
  percentOf,
  policyFor,
  recordCancellation,
  shareOf,
  withServiceFee,
} from '../settlements/ledger.js';
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

const conflict = ApiException.conflict;
const invalid = (message: string) =>
  new ApiException('VALIDATION_FAILED', message, HttpStatus.BAD_REQUEST);
const notFound = (message = 'Booking not found') =>
  new ApiException('NOT_FOUND', message, HttpStatus.NOT_FOUND);

const uniqueViolation = (error: unknown): string | undefined => {
  const cause = (error as { cause?: { code?: string; constraint?: string } }).cause ?? error;
  const pg = cause as { code?: string; constraint?: string };
  return pg.code === '23505' ? (pg.constraint ?? 'unique') : undefined;
};

export const drivers = alias(users, 'driver');

/** The trip's vehicle and driver; left-join `vehicles` and `drivers` on the trip. */
export const assignmentColumns = {
  vehicle: { id: vehicles.id, plate: vehicles.plate, label: vehicles.label },
  driver: { userId: drivers.id, firstName: drivers.firstName, lastName: drivers.lastName },
};

function bookingCode(): string {
  let code = '';
  for (let i = 0; i < 6; i++) code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return `VTP-${code}`;
}

const cents = (amount: string) => Math.round(Number(amount) * 100);

/** What the passenger paid for the fares alone, without the service fee (ADR-029). */
const faresOf = (booking: Pick<BookingRow, 'totalAmount' | 'serviceFee'>) =>
  booking.serviceFee === null
    ? booking.totalAmount
    : fromCents(cents(booking.totalAmount) - cents(booking.serviceFee));
const fromCents = (value: number) => (value / 100).toFixed(2);

@Injectable()
export class BookingsService {
  constructor(
    private readonly database: DatabaseService,
    private readonly trips: TripsService,
    private readonly stops: StopsService,
    private readonly audit: AuditService,
    private readonly config: AppConfigService,
    private readonly notifications: NotificationsService,
  ) {}

  /** Holds the seats for `BOOKING_HOLD_MINUTES`; payment confirms the booking. */
  async create(
    auth: Authenticated,
    input: CreateBookingRequest,
    meta: RequestMeta,
  ): Promise<Booking> {
    const passengerCount = input.passengers.length;
    if (!passengerCount || passengerCount > MAX_SEATS_PER_BOOKING) {
      throw invalid(`Book between 1 and ${MAX_SEATS_PER_BOOKING} seats`);
    }
    await this.stops.assertServed([input.fromStopId, input.toStopId]);

    const context = await this.trips.resolve(
      input.scheduleId,
      input.serviceDate,
      input.fromStopId,
      input.toStopId,
    );
    // Frequency service (ADR-032): an open ticket for the day, numbered here; no seat to choose.
    const open = context.schedule.headwayMinutes !== null;
    const chosen = input.passengers.map((p) => p.seatNumber?.trim().toUpperCase() ?? '');
    if (open && chosen.some(Boolean)) {
      throw invalid('This service sells open tickets: leave seatNumber out');
    }
    if (!open) {
      if (chosen.some((seat) => !seat)) throw invalid('Choose a seat for each passenger');
      if (new Set(chosen).size !== chosen.length) {
        throw invalid('Each seat can be chosen only once');
      }
    }
    if (!context.fare)
      throw conflict('This trip cannot be booked online yet', 'DEPARTURE_NOT_BOOKABLE');
    if (!isBookable(context))
      throw conflict('This departure has already left', 'DEPARTURE_NOT_BOOKABLE');
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
      throw conflict(
        'Pay or cancel your pending bookings before holding more seats',
        'TOO_MANY_HOLDS',
      );
    }

    const holdMinutes = this.config.get('BOOKING_HOLD_MINUTES');
    const fares = fromCents(cents(fare.amount) * passengerCount);
    // The platform's service fee goes on top of the fares (ADR-029), frozen with the hold.
    const serviceFeeRate = await commissionFor(
      this.database.db,
      context.operator.id,
      input.fromStopId,
    );
    const { fee: serviceFee, total } = withServiceFee(fares, serviceFeeRate);
    let booking: BookingRow | undefined;
    for (let attempt = 0; !booking && attempt < 5; attempt++) {
      try {
        booking = await this.database.db.transaction(async (tx) => {
          const trip = await this.trips.getOrCreate(tx, context);
          if (trip.status !== 'scheduled')
            throw conflict('This departure was cancelled', 'DEPARTURE_NOT_BOOKABLE');
          await expireHolds(tx, { tripId: trip.id });
          const valid = seatNumbersOf(trip);
          const seats = open
            ? await this.freeTicketNumbers(tx, trip.id, valid, passengerCount)
            : chosen;
          const unknown = seats.find((seat) => !valid.has(seat));
          if (unknown) throw invalid(`Seat ${unknown} does not exist on this vehicle`);

          const [row] = await tx
            .insert(bookings)
            .values({
              code: bookingCode(),
              tripId: trip.id,
              userId: auth.user.id,
              fromStopId: input.fromStopId,
              toStopId: input.toStopId,
              departsAt: new Date(context.occurrence.departsAt),
              // An open ticket is valid until the last unit of the day arrives.
              arrivesAt: new Date(context.occurrence.lastArrivesAt ?? context.occurrence.arrivesAt),
              fareAmount: fare.amount,
              totalAmount: total,
              contactPhone: input.contactPhone?.replace(/[^\d+]/g, '') || null,
              serviceFee,
              serviceFeeRate,
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
        // Two open tickets numbered at once: number them again.
        if (constraint === 'booking_passengers_active_seat_key' && open) continue;
        if (constraint === 'booking_passengers_active_seat_key') {
          throw conflict('One of the seats was just taken, choose another', 'SEAT_TAKEN');
        }
        if (constraint !== 'bookings_code_key') throw error;
        // Code collision: retry with a new code.
      }
    }
    if (!booking && open) {
      throw conflict('Many tickets were sold at once, try again', 'RELOAD_AND_RETRY');
    }
    if (!booking) throw new Error('Could not generate a unique booking code');
    await this.audit.record({
      action: 'booking.held',
      actorUserId: auth.user.id,
      targetType: 'booking',
      targetId: booking.id,
      ip: meta.ip,
      metadata: { tripId: booking.tripId, seats: passengerCount, open },
    });
    return (await this.toBookings([booking]))[0]!;
  }

  async listMine(userId: string): Promise<Booking[]> {
    await expireHolds(this.database.db, { userId });
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

  /**
   * Support (platform staff): a booking by its code (`VTP-7K3QXA`, `7k3qxa` or `vtp7k3qxa`), with the
   * passenger's contact. Every lookup is audited: it shows personal data.
   */
  async findByCode(
    rawCode: string,
    actor: Authenticated,
    meta: RequestMeta,
  ): Promise<AdminBookingLookup> {
    const code = normalizeBookingCode(rawCode);
    const [row] = code
      ? await this.database.db
          .select({ booking: bookings, user: users })
          .from(bookings)
          .innerJoin(users, eq(users.id, bookings.userId))
          .where(eq(bookings.code, code))
      : [];
    if (!row) throw notFound();
    await this.audit.record({
      action: 'booking.looked_up',
      actorUserId: actor.user.id,
      targetType: 'booking',
      targetId: row.booking.id,
      ip: meta.ip,
    });
    const [booking] = await this.toBookings([row.booking]);
    return {
      booking: booking!,
      customer: {
        name: [row.user.firstName, row.user.lastName].filter(Boolean).join(' ') || null,
        email: row.user.email,
        phone: row.user.phone ?? row.booking.contactPhone,
      },
    };
  }

  /** The lowest ticket numbers of the day nobody holds, or 409 when the day is sold out. */
  private async freeTicketNumbers(
    tx: Transaction,
    tripId: string,
    valid: Set<string>,
    count: number,
  ): Promise<string[]> {
    const taken = new Set(
      (
        await tx
          .select({ seatNumber: bookingPassengers.seatNumber })
          .from(bookingPassengers)
          .where(and(eq(bookingPassengers.tripId, tripId), eq(bookingPassengers.active, true)))
      ).map((row) => row.seatNumber),
    );
    const free = [...valid].filter((n) => !taken.has(n)).sort(compareSeats);
    if (free.length < count) {
      throw conflict('There are no tickets left for this day', 'DEPARTURE_NOT_BOOKABLE');
    }
    return free.slice(0, count);
  }

  /**
   * Who the service-fee invoice is for (ADR-031): another name, or `null` for the first passenger.
   * Allowed until the invoice is issued.
   */
  async setBilling(
    userId: string,
    bookingId: string,
    billing: InvoiceBuyer | null,
  ): Promise<Booking> {
    await this.requireMine(userId, bookingId);
    await this.database.db.transaction(async (tx) => {
      await tx
        .update(bookings)
        .set({
          billingName: billing?.name.trim() ?? null,
          billingIdType: billing?.idType ?? null,
          billingIdNumber: billing?.idNumber.trim().toUpperCase() ?? null,
          billingAddress: billing?.address?.trim() || null,
          updatedAt: new Date(),
        })
        .where(eq(bookings.id, bookingId));
      await applyBilling(tx, bookingId);
    });
    return this.getMine(userId, bookingId);
  }

  /** What cancelling a paid booking now would refund, per the operator's policy (ADR-025). */
  async cancellationQuote(userId: string, bookingId: string): Promise<CancellationQuote> {
    const booking = await this.requireMine(userId, bookingId);
    if (booking.status !== 'confirmed')
      throw conflict('Only paid bookings have a refund quote', 'BOOKING_NOT_CANCELLABLE');
    return (await this.quote(this.database.db, booking)).quote;
  }

  /**
   * Cancels a booking and frees its seats. A held one simply goes; a paid one is refunded per the
   * operator's policy (the refund joins the admins' queue) until the bus leaves or someone boards.
   */
  async cancelMine(auth: Authenticated, bookingId: string, meta: RequestMeta): Promise<Booking> {
    const booking = await this.requireMine(auth.user.id, bookingId);
    if (booking.status !== 'held' && booking.status !== 'confirmed') {
      throw conflict(`A ${booking.status} booking cannot be cancelled`, 'BOOKING_NOT_CANCELLABLE');
    }
    let refundPercent: number | null = null;
    const cancelled = await this.database.db.transaction(async (tx) => {
      // Lock the booking: a payment confirming it, or a second cancel, waits for this one.
      const [locked] = await tx
        .select()
        .from(bookings)
        .where(eq(bookings.id, booking.id))
        .for('update');
      if (locked?.status !== booking.status)
        throw conflict('The booking changed, reload and retry', 'RELOAD_AND_RETRY');
      if (locked.status === 'confirmed') {
        const { quote, payment, fareRefund } = await this.quote(tx, locked);
        if (!quote.cancellable) {
          throw conflict('The bus left or a passenger boarded', 'BOOKING_NOT_CANCELLABLE');
        }
        refundPercent = quote.refundPercent;
        if (payment && quote.refund) {
          await tx
            .update(payments)
            .set({ status: 'refund_due', refundAmount: quote.refund.amount })
            .where(eq(payments.id, payment.id));
        }
        if (quote.refundPercent > 0) await recordCancellation(tx, locked.id, fareRefund);
      }
      const [row] = await tx
        .update(bookings)
        .set({ status: 'cancelled', cancelledAt: new Date(), expiresAt: null })
        .where(eq(bookings.id, locked.id))
        .returning();
      await tx
        .update(bookingPassengers)
        .set({ active: false })
        .where(eq(bookingPassengers.bookingId, locked.id));
      return row!;
    });
    await this.audit.record({
      action: 'booking.cancelled',
      actorUserId: auth.user.id,
      targetType: 'booking',
      targetId: booking.id,
      ip: meta.ip,
      metadata: refundPercent === null ? undefined : { paid: true, refundPercent },
    });
    if (refundPercent !== null) {
      this.notifications.later(async () => {
        const [payment] = await this.database.db
          .select()
          .from(payments)
          .where(and(eq(payments.bookingId, booking.id), eq(payments.status, 'refund_due')));
        return {
          kind: 'booking_cancelled',
          userIds: [booking.userId],
          app: 'passenger',
          email: true,
          reference: { key: 'bookingId', id: booking.id },
          text: (m, locale) =>
            m.bookingCancelled(
              booking.code,
              payment?.refundAmount
                ? formatPaymentAmount(payment.refundAmount, payment.currency, locale)
                : null,
            ),
        };
      });
    }
    return (await this.toBookings([cancelled]))[0]!;
  }

  /**
   * The operator cancels one departure before it leaves (creating its trip if nobody booked it,
   * so it also stops being sold). Held bookings are released; paid ones are refunded in full by
   * whoever collected the money, and the platform keeps its commission. Passengers are told.
   */
  async cancelDeparture(
    organizationId: string,
    input: { scheduleId: string; serviceDate: string; reason: string },
    auth: Authenticated,
    meta: RequestMeta,
  ): Promise<CancelDepartureResult> {
    const reason = input.reason.trim();
    const trip = await this.trips.ensure(organizationId, input.scheduleId, input.serviceDate);
    const affected: { bookingId: string; userId: string; paid: boolean }[] = [];
    await this.database.db.transaction(async (tx) => {
      const [locked] = await tx.select().from(trips).where(eq(trips.id, trip.id)).for('update');
      if (locked!.status === 'cancelled')
        throw conflict('This trip is cancelled', 'TRIP_CANCELLED');
      if (locked!.departedAt) {
        throw conflict('The bus already left', 'TRIP_WRONG_STEP');
      }
      await tx
        .update(trips)
        .set({
          status: 'cancelled',
          cancellationReason: reason,
          cancelledAt: new Date(),
          cancelledByUserId: auth.user.id,
        })
        .where(eq(trips.id, trip.id));
      const open = await tx
        .select()
        .from(bookings)
        .where(and(eq(bookings.tripId, trip.id), inArray(bookings.status, ['held', 'confirmed'])))
        .for('update');
      for (const booking of open) {
        const paid = booking.status === 'confirmed';
        if (paid) {
          const [payment] = await tx
            .select()
            .from(payments)
            .where(and(eq(payments.bookingId, booking.id), eq(payments.status, 'confirmed')));
          if (payment) {
            await tx
              .update(payments)
              .set({
                status: 'refund_due',
                refundAmount: payment.receivedAmount ?? payment.amount,
              })
              .where(eq(payments.id, payment.id));
          }
          await recordCancellation(tx, booking.id, booking.totalAmount, true);
          await correctFeeInvoice(tx, booking.id);
        } else {
          await tx
            .update(payments)
            .set({ status: 'cancelled' })
            .where(and(eq(payments.bookingId, booking.id), eq(payments.status, 'pending')));
        }
        await tx
          .update(bookings)
          .set({ status: 'cancelled', cancelledAt: new Date(), expiresAt: null })
          .where(eq(bookings.id, booking.id));
        await tx
          .update(bookingPassengers)
          .set({ active: false })
          .where(eq(bookingPassengers.bookingId, booking.id));
        affected.push({ bookingId: booking.id, userId: booking.userId, paid });
      }
    });
    await this.audit.record({
      action: 'trip.cancelled',
      actorUserId: auth.user.id,
      targetType: 'trip',
      targetId: trip.id,
      ip: meta.ip,
      metadata: { organizationId, reason, bookings: affected.length },
    });
    for (const { bookingId, userId, paid } of affected) {
      this.notifications.later(async () => {
        const booking = await this.notifications.booking(bookingId);
        const [payment] = paid
          ? await this.database.db
              .select()
              .from(payments)
              .where(and(eq(payments.bookingId, bookingId), eq(payments.status, 'refund_due')))
          : [];
        return {
          kind: 'departure_cancelled',
          userIds: [userId],
          app: 'passenger',
          email: true,
          reference: { key: 'bookingId', id: bookingId },
          text: (m, locale) =>
            m.departureCancelled(
              booking.code,
              booking.route,
              departureText(booking.departsAt, locale),
              reason,
              payment
                ? formatPaymentAmount(
                    payment.refundAmount ?? payment.amount,
                    payment.currency,
                    locale,
                  )
                : null,
            ),
        };
      });
    }
    return {
      tripId: trip.id,
      cancelledBookings: affected.length,
      refundsDue: affected.filter((a) => a.paid).length,
    };
  }

  /** Refund for a confirmed booking now: in the payment's currency, and in the fare's. */
  private async quote(
    db: Database | Transaction,
    booking: BookingRow,
  ): Promise<{ quote: CancellationQuote; payment: PaymentRow | undefined; fareRefund: string }> {
    const [trip] = await db
      .select({ organizationId: trips.organizationId, departedAt: trips.departedAt })
      .from(trips)
      .where(eq(trips.id, booking.tripId));
    const { refundTiers } = await policyFor(db, trip!.organizationId);
    const [boarded] = await db
      .select({ n: count() })
      .from(bookingPassengers)
      .where(
        and(
          eq(bookingPassengers.bookingId, booking.id),
          sql`${bookingPassengers.boardedAt} is not null`,
        ),
      );
    const [payment] = await db
      .select()
      .from(payments)
      .where(and(eq(payments.bookingId, booking.id), eq(payments.status, 'confirmed')));
    const hoursLeft = (booking.departsAt.getTime() - Date.now()) / 3_600_000;
    const cancellable = hoursLeft > 0 && (boarded?.n ?? 0) === 0 && !trip!.departedAt;
    const refundPercent = cancellable ? refundPercentFor(refundTiers, hoursLeft) : 0;
    // The refund tiers apply to the fares; the service fee is not refunded when the passenger
    // cancels (ADR-029). `faresOf` is the whole total for bookings made before the fee existed.
    const fares = faresOf(booking);
    const refundAmount = payment
      ? percentOf(shareOf(payment.amount, fares, booking.totalAmount), refundPercent)
      : '0.00';
    return {
      quote: {
        cancellable,
        hoursBeforeDeparture: Math.round(hoursLeft * 10) / 10,
        refundPercent,
        refund:
          payment && refundPercent > 0
            ? { amount: refundAmount, currency: payment.currency }
            : null,
        policy: refundTiers,
      },
      payment,
      fareRefund: percentOf(fares, refundPercent),
    };
  }

  /**
   * Confirms a held booking once its payment arrived, inside the payment's transaction. Also
   * accepts a hold that ran out but was not released yet: its seats are still this booking's.
   * Row locks serialize this with `expireHolds`. Returns false when the booking is no longer held.
   */
  async confirmHeld(tx: Transaction, bookingId: string): Promise<boolean> {
    const [confirmed] = await tx
      .update(bookings)
      .set({ status: 'confirmed', confirmedAt: new Date(), expiresAt: null })
      .where(and(eq(bookings.id, bookingId), eq(bookings.status, 'held')))
      .returning({ id: bookings.id });
    return Boolean(confirmed);
  }

  /** Trips of an organization on a service date, with seat counts. */
  async tripsOn(organizationId: string, serviceDate: string): Promise<TripSummary[]> {
    const rows = await this.database.db
      .select({
        trip: trips,
        route: { id: routes.id, name: routes.name },
        serviceClass: routeSchedules.serviceClass,
        ...assignmentColumns,
      })
      .from(trips)
      .innerJoin(routes, eq(routes.id, trips.routeId))
      .innerJoin(routeSchedules, eq(routeSchedules.id, trips.scheduleId))
      .leftJoin(vehicles, eq(vehicles.id, trips.vehicleId))
      .leftJoin(drivers, eq(drivers.id, trips.driverUserId))
      .where(and(eq(trips.organizationId, organizationId), eq(trips.serviceDate, serviceDate)))
      .orderBy(asc(trips.departsAt));
    const counts = await this.seatCounts(rows.map((r) => r.trip.id));
    return rows.map((row) => summary(row, counts));
  }

  /** Occupied seats per trip and booking status, for `summary()`. */
  async seatCounts(tripIds: string[]): Promise<SeatCount[]> {
    if (!tripIds.length) return [];
    return this.database.db
      .select({ tripId: bookingPassengers.tripId, status: bookings.status, seats: count() })
      .from(bookingPassengers)
      .innerJoin(bookings, and(eq(bookings.id, bookingPassengers.bookingId), occupiesSeat()))
      .where(and(inArray(bookingPassengers.tripId, tripIds), eq(bookingPassengers.active, true)))
      .groupBy(bookingPassengers.tripId, bookings.status);
  }

  async manifest(organizationId: string, tripId: string): Promise<TripManifest> {
    const [row] = await this.database.db
      .select({
        trip: trips,
        route: { id: routes.id, name: routes.name },
        serviceClass: routeSchedules.serviceClass,
        ...assignmentColumns,
      })
      .from(trips)
      .innerJoin(routes, eq(routes.id, trips.routeId))
      .innerJoin(routeSchedules, eq(routeSchedules.id, trips.scheduleId))
      .leftJoin(vehicles, eq(vehicles.id, trips.vehicleId))
      .leftJoin(drivers, eq(drivers.id, trips.driverUserId))
      .where(and(eq(trips.id, tripId), eq(trips.organizationId, organizationId)));
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
      ...summary(row, counts),
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
          boardedAt: passenger.boardedAt?.toISOString() ?? null,
        }))
        .sort((a, b) => compareSeats(a.seatNumber, b.seatNumber)),
    };
  }

  private async requireMine(userId: string, bookingId: string): Promise<BookingRow> {
    await expireHolds(this.database.db, { userId });
    const [booking] = await this.database.db
      .select()
      .from(bookings)
      .where(and(eq(bookings.id, bookingId), eq(bookings.userId, userId)));
    if (!booking) throw notFound();
    return booking;
  }

  async toBookings(rows: BookingRow[]): Promise<Booking[]> {
    if (!rows.length) return [];
    const tripRows = await this.database.db
      .select({
        trip: trips,
        route: { id: routes.id, name: routes.name },
        serviceClass: routeSchedules.serviceClass,
        headwayMinutes: routeSchedules.headwayMinutes,
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
    const paymentRows = await this.database.db
      .select()
      .from(payments)
      .where(
        inArray(
          payments.bookingId,
          rows.map((b) => b.id),
        ),
      );
    const stops = await this.stops.summaries([
      ...new Set(rows.flatMap((b) => [b.fromStopId, b.toStopId])),
    ]);
    const feeInvoices = await this.database.db
      .select({
        bookingId: invoices.bookingId,
        status: invoices.status,
        number: invoices.number,
        controlNumber: invoices.controlNumber,
        issuedOn: invoices.issuedOn,
      })
      .from(invoices)
      .where(
        and(
          inArray(
            invoices.bookingId,
            rows.map((b) => b.id),
          ),
          eq(invoices.reason, 'service_fee'),
        ),
      );
    const refundPolicies = new Map<string, RefundTier[]>();
    for (const operatorId of new Set(tripRows.map((t) => t.operator.id))) {
      refundPolicies.set(operatorId, (await policyFor(this.database.db, operatorId)).refundTiers);
    }
    return rows.map((booking) => {
      const payment = currentPayment(
        paymentRows.filter((p) => p.bookingId === booking.id),
        booking.status === 'held',
      );
      const trip = tripRows.find((t) => t.trip.id === booking.tripId)!;
      const invoice = feeInvoices.find((i) => i.bookingId === booking.id);
      return {
        id: booking.id,
        code: booking.code,
        status: booking.status,
        trip: {
          id: trip.trip.id,
          scheduleId: trip.trip.scheduleId,
          serviceDate: trip.trip.serviceDate,
          departsAt: toNetworkIso(booking.departsAt),
          arrivesAt: toNetworkIso(booking.arrivesAt),
          serviceClass: trip.serviceClass,
          headwayMinutes: trip.headwayMinutes,
          cancellation:
            trip.trip.status === 'cancelled'
              ? { reason: trip.trip.cancellationReason ?? '' }
              : null,
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
            ticket:
              booking.status === 'confirmed' && p.active
                ? {
                    qr: `${TICKET_QR_PREFIX}${p.id}`,
                    boardedAt: p.boardedAt?.toISOString() ?? null,
                  }
                : null,
          })),
        total: { amount: booking.totalAmount, currency: booking.currency },
        fares: faresOf(booking),
        serviceFee:
          booking.serviceFee !== null && booking.serviceFeeRate !== null
            ? { amount: booking.serviceFee, rate: booking.serviceFeeRate }
            : null,
        expiresAt:
          booking.status === 'held' && booking.expiresAt ? booking.expiresAt.toISOString() : null,
        payment: payment ? toPayment(payment) : null,
        refundPolicy: refundPolicies.get(trip.operator.id) ?? [],
        billing: billingOf(booking),
        contactPhone: booking.contactPhone,
        invoice: invoice
          ? {
              status: invoice.status,
              number: invoice.number,
              controlNumber: invoice.controlNumber,
              issuedOn: invoice.issuedOn,
            }
          : null,
        createdAt: booking.createdAt.toISOString(),
      };
    });
  }
}

/** `vtp-7k3qxa`, `VTP7K3QXA` or `7K3QXA` → `VTP-7K3QXA`; null if it cannot be a booking code. */
export function normalizeBookingCode(input: string): string | null {
  const bare = input
    .trim()
    .toUpperCase()
    .replace(/^VTP-?/, '');
  return /^[A-Z0-9]{6}$/.test(bare) ? `VTP-${bare}` : null;
}

function billingOf(booking: BookingRow): InvoiceBuyer | null {
  const idType = BUYER_ID_TYPES.find((t) => t === booking.billingIdType);
  if (!booking.billingName || !idType || !booking.billingIdNumber) return null;
  return {
    name: booking.billingName,
    idType,
    idNumber: booking.billingIdNumber,
    address: booking.billingAddress,
  };
}

export type SeatCount = { tripId: string; status: BookingRow['status']; seats: number };

export function summary(
  row: {
    trip: TripRow;
    route: { id: string; name: string };
    serviceClass: TripSummary['serviceClass'];
    vehicle: TripSummary['vehicle'];
    driver: TripSummary['driver'];
  },
  counts: SeatCount[],
): TripSummary {
  const { trip } = row;
  const seatsWith = (status: BookingRow['status']) =>
    counts
      .filter((c) => c.tripId === trip.id && c.status === status)
      .reduce((n, c) => n + c.seats, 0);
  return {
    id: trip.id,
    scheduleId: trip.scheduleId,
    serviceDate: trip.serviceDate,
    route: row.route,
    departureTime: toNetworkIso(trip.departsAt).slice(11, 16),
    serviceClass: row.serviceClass,
    capacity: trip.capacity,
    soldSeats: seatsWith('confirmed'),
    heldSeats: seatsWith('held'),
    vehicle: row.vehicle,
    driver: row.driver,
    departedAt: trip.departedAt?.toISOString() ?? null,
    arrivedAt: trip.arrivedAt?.toISOString() ?? null,
    cancellation:
      trip.status === 'cancelled' && trip.cancelledAt
        ? { reason: trip.cancellationReason ?? '', at: trip.cancelledAt.toISOString() }
        : null,
  };
}
