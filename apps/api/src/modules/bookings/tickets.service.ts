import { HttpStatus, Injectable } from '@nestjs/common';
import {
  inBoardingWindow as boardingWindowOk,
  normalizeBookingCode,
  OFFLINE_TICKETS_AHEAD_HOURS,
  offlineTime,
  ticketIdFromQr,
  type BoardingIssue,
  type OfflineBoardingOutcome,
  type OfflineBoardingsRequest,
  type OfflineTicketList,
  type TicketValidation,
  type ValidateTicketRequest,
  toNetworkIso,
} from '@vtp/shared-types';
import { and, asc, desc, eq, gte, isNull, lte, type SQL } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { ApiException } from '../../common/errors/api.exception.js';
import { DatabaseService } from '../../database/database.service.js';
import { AuditService } from '../audit/audit.service.js';
import type { Authenticated, RequestMeta } from '../identity/sessions.service.js';
import { routes, routeSchedules } from '../network/network.schema.js';
import { StopsService } from '../network/stops.service.js';
import type { OrganizationAccess } from '../organizations/organization-access.js';
import { users } from '../identity/identity.schema.js';
import { boardingIssues, bookingPassengers, bookings, trips } from './bookings.schema.js';

const HOUR_MS = 3600_000;
/** Tickets a phone keeps: boarding windows reach 12 hours past departure. */
const OFFLINE_TICKETS_LIMIT = 5000;

/** Whether `now` falls in the ticket's boarding window (shared with the driver's phone). */
export function inBoardingWindow(
  booking: { departsAt: Date; arrivesAt: Date },
  open: boolean,
  now: number,
): boolean {
  return boardingWindowOk(
    { departsAt: booking.departsAt.getTime(), arrivesAt: booking.arrivesAt.getTime() },
    open,
    now,
  );
}

/** `V-12345678` → `V-•••5678`: the phone keeps only what the driver needs to compare. */
const documentHint = (type: string, number: string) => `${type}-•••${number.slice(-4)}`;
const fullName = (u: { firstName: string | null; lastName: string | null } | undefined) =>
  u ? [u.firstName, u.lastName].filter(Boolean).join(' ') || null : null;

const ticketNotFound = () =>
  new ApiException('NOT_FOUND', 'Ticket not found for this organization', HttpStatus.NOT_FOUND);

@Injectable()
export class TicketsService {
  constructor(
    private readonly database: DatabaseService,
    private readonly stops: StopsService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Checks a ticket, from its QR or from the booking code and seat typed by hand, and marks the
   * passenger as boarded on the first valid check. Unknown tickets (or another organization's)
   * are 404; every other outcome is reported in `result` with the passenger's details.
   */
  async validate(
    access: OrganizationAccess,
    input: ValidateTicketRequest,
    auth: Authenticated,
    meta: RequestMeta,
    now = Date.now(),
  ): Promise<TicketValidation> {
    const [row] = await this.database.db
      .select({
        passenger: bookingPassengers,
        booking: bookings,
        trip: { serviceDate: trips.serviceDate },
        route: { id: routes.id, name: routes.name },
        headwayMinutes: routeSchedules.headwayMinutes,
      })
      .from(bookingPassengers)
      .innerJoin(bookings, eq(bookings.id, bookingPassengers.bookingId))
      .innerJoin(trips, eq(trips.id, bookingPassengers.tripId))
      .innerJoin(routes, eq(routes.id, trips.routeId))
      .innerJoin(routeSchedules, eq(routeSchedules.id, trips.scheduleId))
      .where(and(ticketMatch(input), eq(trips.organizationId, access.organization.id)))
      .orderBy(desc(bookingPassengers.active))
      .limit(1);
    if (!row) throw ticketNotFound();
    const { passenger, booking } = row;
    const open = row.headwayMinutes !== null;

    let result: TicketValidation['result'];
    let boardedAt = passenger.boardedAt;
    if (booking.status !== 'confirmed' || !passenger.active) {
      result = 'not_paid';
    } else if (!inBoardingWindow(booking, open, now)) {
      result = 'other_departure';
    } else {
      const [boarded] = await this.database.db
        .update(bookingPassengers)
        .set({ boardedAt: new Date(now), boardedByUserId: auth.user.id })
        .where(and(eq(bookingPassengers.id, passenger.id), isNull(bookingPassengers.boardedAt)))
        .returning({ boardedAt: bookingPassengers.boardedAt });
      if (boarded) {
        result = 'boarded';
        boardedAt = boarded.boardedAt;
        // On a frequency day many units run the same trip: the first driver who validates the
        // ticket is the one a route paid to drivers pays (ADR-032).
        if (open) {
          await this.database.db
            .update(bookings)
            .set({ boardingDriverUserId: auth.user.id })
            .where(and(eq(bookings.id, booking.id), isNull(bookings.boardingDriverUserId)));
        }
        await this.audit.record({
          action: 'ticket.boarded',
          actorUserId: auth.user.id,
          targetType: 'booking',
          targetId: booking.id,
          ip: meta.ip,
          metadata: { organizationId: access.organization.id, seatNumber: passenger.seatNumber },
        });
      } else {
        result = 'already_boarded';
      }
    }

    const stops = await this.stops.summaries([booking.fromStopId, booking.toStopId]);
    return {
      result,
      boardedAt: boardedAt?.toISOString() ?? null,
      bookingCode: booking.code,
      bookingStatus: booking.status,
      seatNumber: passenger.seatNumber,
      passengerName: `${passenger.firstName} ${passenger.lastName}`,
      documentNumber: `${passenger.documentType}-${passenger.documentNumber}`,
      route: row.route,
      serviceDate: row.trip.serviceDate,
      departsAt: toNetworkIso(booking.departsAt),
      from: stops.get(booking.fromStopId)!,
      to: stops.get(booking.toStopId)!,
    };
  }

  // --- Without signal (ADR-049) --------------------------------------------------------------

  /**
   * The paid tickets of the line that board between now and `OFFLINE_TICKETS_AHEAD_HOURS`
   * ahead (and the ones still in their window): the driver's phone keeps them and checks them
   * when there is no signal.
   */
  async offlineList(access: OrganizationAccess, now = Date.now()): Promise<OfflineTicketList> {
    const rows = await this.database.db
      .select({
        passenger: bookingPassengers,
        booking: {
          code: bookings.code,
          departsAt: bookings.departsAt,
          arrivesAt: bookings.arrivesAt,
          fromStopId: bookings.fromStopId,
          toStopId: bookings.toStopId,
        },
        serviceDate: trips.serviceDate,
        route: { id: routes.id, name: routes.name },
        headwayMinutes: routeSchedules.headwayMinutes,
      })
      .from(bookingPassengers)
      .innerJoin(bookings, eq(bookings.id, bookingPassengers.bookingId))
      .innerJoin(trips, eq(trips.id, bookingPassengers.tripId))
      .innerJoin(routes, eq(routes.id, trips.routeId))
      .innerJoin(routeSchedules, eq(routeSchedules.id, trips.scheduleId))
      .where(
        and(
          eq(trips.organizationId, access.organization.id),
          eq(bookings.status, 'confirmed'),
          eq(bookingPassengers.active, true),
          lte(bookings.departsAt, new Date(now + (OFFLINE_TICKETS_AHEAD_HOURS + 1) * HOUR_MS)),
          gte(bookings.arrivesAt, new Date(now - 12 * HOUR_MS)),
        ),
      )
      .orderBy(asc(bookings.departsAt))
      .limit(OFFLINE_TICKETS_LIMIT);
    const stops = await this.stops.summaries(
      rows.flatMap((r) => [r.booking.fromStopId, r.booking.toStopId]),
    );
    return {
      generatedAt: new Date(now).toISOString(),
      tickets: rows.map((r) => ({
        ticketId: r.passenger.id,
        bookingCode: r.booking.code,
        seatNumber: r.passenger.seatNumber,
        passengerName: `${r.passenger.firstName} ${r.passenger.lastName}`,
        documentHint: documentHint(r.passenger.documentType, r.passenger.documentNumber),
        route: r.route,
        serviceDate: r.serviceDate,
        departsAt: toNetworkIso(r.booking.departsAt),
        arrivesAt: toNetworkIso(r.booking.arrivesAt),
        open: r.headwayMinutes !== null,
        from: stops.get(r.booking.fromStopId)!,
        to: stops.get(r.booking.toStopId)!,
        boardedAt: r.passenger.boardedAt?.toISOString() ?? null,
      })),
    };
  }

  /**
   * Boardings the phone accepted without signal, sent when it is back. The first boarding of a
   * ticket counts; a later one from another driver is recorded as `double_use`, and one whose
   * booking was cancelled meanwhile as `not_paid`. Sending the same boarding again is harmless.
   */
  async offlineBoardings(
    access: OrganizationAccess,
    input: OfflineBoardingsRequest,
    auth: Authenticated,
    meta: RequestMeta,
    now = Date.now(),
  ): Promise<OfflineBoardingOutcome[]> {
    const outcomes: OfflineBoardingOutcome[] = [];
    for (const boarding of input.boardings) {
      const [row] = await this.database.db
        .select({
          passenger: bookingPassengers,
          booking: bookings,
          headway: routeSchedules.headwayMinutes,
        })
        .from(bookingPassengers)
        .innerJoin(bookings, eq(bookings.id, bookingPassengers.bookingId))
        .innerJoin(trips, eq(trips.id, bookingPassengers.tripId))
        .innerJoin(routeSchedules, eq(routeSchedules.id, trips.scheduleId))
        .where(
          and(
            eq(bookingPassengers.id, boarding.ticketId),
            eq(trips.organizationId, access.organization.id),
          ),
        );
      if (!row) {
        outcomes.push({ ticketId: boarding.ticketId, result: 'not_found' });
        continue;
      }
      const { passenger, booking } = row;
      const at = new Date(offlineTime(boarding.boardedAt, now));
      const issue = (
        kind: 'double_use' | 'not_paid',
        first: Date | null,
        firstUserId: string | null,
      ) =>
        this.database.db
          .insert(boardingIssues)
          .values({
            organizationId: access.organization.id,
            passengerId: passenger.id,
            kind,
            firstBoardedAt: first,
            firstUserId,
            secondBoardedAt: at,
            secondUserId: auth.user.id,
          })
          .onConflictDoNothing();
      if (booking.status !== 'confirmed' || !passenger.active) {
        await issue('not_paid', null, null);
        outcomes.push({ ticketId: passenger.id, result: 'not_paid' });
        continue;
      }
      const [boarded] = await this.database.db
        .update(bookingPassengers)
        .set({ boardedAt: at, boardedByUserId: auth.user.id })
        .where(and(eq(bookingPassengers.id, passenger.id), isNull(bookingPassengers.boardedAt)))
        .returning({ boardedAt: bookingPassengers.boardedAt });
      if (boarded) {
        if (row.headway !== null) {
          await this.database.db
            .update(bookings)
            .set({ boardingDriverUserId: auth.user.id })
            .where(and(eq(bookings.id, booking.id), isNull(bookings.boardingDriverUserId)));
        }
        await this.audit.record({
          action: 'ticket.boarded_offline',
          actorUserId: auth.user.id,
          targetType: 'booking',
          targetId: booking.id,
          ip: meta.ip,
          metadata: {
            organizationId: access.organization.id,
            seatNumber: passenger.seatNumber,
            boardedAt: at.toISOString(),
          },
        });
        outcomes.push({ ticketId: passenger.id, result: 'boarded' });
        continue;
      }
      // Used before: by this same driver (a resend) is fine; by someone else, a double use.
      if (passenger.boardedByUserId !== auth.user.id) {
        await issue('double_use', passenger.boardedAt, passenger.boardedByUserId);
      }
      outcomes.push({ ticketId: passenger.id, result: 'already_boarded' });
    }
    return outcomes;
  }

  /** What the line has to review: issues found with boardings made without signal. */
  async boardingIssues(access: OrganizationAccess, date?: string): Promise<BoardingIssue[]> {
    const firstUser = alias(users, 'first_user');
    const secondUser = alias(users, 'second_user');
    const rows = await this.database.db
      .select({
        issue: boardingIssues,
        passenger: {
          firstName: bookingPassengers.firstName,
          lastName: bookingPassengers.lastName,
          seatNumber: bookingPassengers.seatNumber,
        },
        bookingCode: bookings.code,
        serviceDate: trips.serviceDate,
        route: { id: routes.id, name: routes.name },
        first: { firstName: firstUser.firstName, lastName: firstUser.lastName },
        second: { firstName: secondUser.firstName, lastName: secondUser.lastName },
      })
      .from(boardingIssues)
      .innerJoin(bookingPassengers, eq(bookingPassengers.id, boardingIssues.passengerId))
      .innerJoin(bookings, eq(bookings.id, bookingPassengers.bookingId))
      .innerJoin(trips, eq(trips.id, bookingPassengers.tripId))
      .innerJoin(routes, eq(routes.id, trips.routeId))
      .leftJoin(firstUser, eq(firstUser.id, boardingIssues.firstUserId))
      .leftJoin(secondUser, eq(secondUser.id, boardingIssues.secondUserId))
      .where(
        and(
          eq(boardingIssues.organizationId, access.organization.id),
          date ? eq(trips.serviceDate, date) : undefined,
        ),
      )
      .orderBy(desc(boardingIssues.createdAt))
      .limit(200);
    return rows.map((r) => ({
      id: r.issue.id,
      kind: r.issue.kind,
      bookingCode: r.bookingCode,
      seatNumber: r.passenger.seatNumber,
      passengerName: `${r.passenger.firstName} ${r.passenger.lastName}`,
      route: r.route,
      serviceDate: r.serviceDate,
      first: r.issue.firstBoardedAt
        ? {
            boardedAt: r.issue.firstBoardedAt.toISOString(),
            driverName: fullName(r.first ?? undefined),
          }
        : null,
      second: {
        boardedAt: r.issue.secondBoardedAt.toISOString(),
        driverName: fullName(r.second ?? undefined),
      },
      createdAt: r.issue.createdAt.toISOString(),
    }));
  }
}

/** The row a QR payload or a typed booking code + seat points to. */
function ticketMatch(input: ValidateTicketRequest): SQL {
  if ('qr' in input && typeof input.qr === 'string') {
    const ticketId = ticketIdFromQr(input.qr);
    if (!ticketId) throw ticketNotFound();
    return eq(bookingPassengers.id, ticketId);
  }
  const typed = input as { bookingCode: string; seatNumber: string };
  const code = normalizeBookingCode(typed.bookingCode);
  if (!code) throw ticketNotFound();
  return and(
    eq(bookings.code, code),
    eq(bookingPassengers.seatNumber, typed.seatNumber.trim().toUpperCase()),
  )!;
}
