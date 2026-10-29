import { HttpStatus, Injectable } from '@nestjs/common';
import {
  TICKET_QR_PREFIX,
  type TicketValidation,
  type ValidateTicketRequest,
  toNetworkIso,
} from '@vtp/shared-types';
import { and, desc, eq, isNull, type SQL } from 'drizzle-orm';
import { ApiException } from '../../common/errors/api.exception.js';
import { DatabaseService } from '../../database/database.service.js';
import { AuditService } from '../audit/audit.service.js';
import type { Authenticated, RequestMeta } from '../identity/sessions.service.js';
import { routes } from '../network/network.schema.js';
import { StopsService } from '../network/stops.service.js';
import type { OrganizationAccess } from '../organizations/organization-access.js';
import { bookingPassengers, bookings, trips } from './bookings.schema.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** A ticket is accepted from 12 hours before to 12 hours after the passenger's boarding time. */
const BOARDING_WINDOW_MS = 12 * 3600_000;

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
      })
      .from(bookingPassengers)
      .innerJoin(bookings, eq(bookings.id, bookingPassengers.bookingId))
      .innerJoin(trips, eq(trips.id, bookingPassengers.tripId))
      .innerJoin(routes, eq(routes.id, trips.routeId))
      .where(and(ticketMatch(input), eq(trips.organizationId, access.organization.id)))
      .orderBy(desc(bookingPassengers.active))
      .limit(1);
    if (!row) throw ticketNotFound();
    const { passenger, booking } = row;

    let result: TicketValidation['result'];
    let boardedAt = passenger.boardedAt;
    if (booking.status !== 'confirmed' || !passenger.active) {
      result = 'not_paid';
    } else if (Math.abs(now - booking.departsAt.getTime()) > BOARDING_WINDOW_MS) {
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
}

/** The row a QR payload or a typed booking code + seat points to. */
function ticketMatch(input: ValidateTicketRequest): SQL {
  if ('qr' in input && typeof input.qr === 'string') {
    const payload = input.qr.trim();
    const ticketId = payload.startsWith(TICKET_QR_PREFIX)
      ? payload.slice(TICKET_QR_PREFIX.length)
      : '';
    if (!UUID.test(ticketId)) throw ticketNotFound();
    return eq(bookingPassengers.id, ticketId);
  }
  const typed = input as { bookingCode: string; seatNumber: string };
  const code = typed.bookingCode
    .trim()
    .toUpperCase()
    .replace(/^(VTP)?-?/, 'VTP-');
  return and(
    eq(bookings.code, code),
    eq(bookingPassengers.seatNumber, typed.seatNumber.trim().toUpperCase()),
  )!;
}
