import { HttpStatus, Injectable } from '@nestjs/common';
import { TICKET_QR_PREFIX, type TicketValidation } from '@vtp/shared-types';
import { and, eq, isNull } from 'drizzle-orm';
import { ApiException } from '../../common/errors/api.exception.js';
import { DatabaseService } from '../../database/database.service.js';
import { AuditService } from '../audit/audit.service.js';
import type { Authenticated, RequestMeta } from '../identity/sessions.service.js';
import { routes } from '../network/network.schema.js';
import { StopsService } from '../network/stops.service.js';
import type { OrganizationAccess } from '../organizations/organization-access.js';
import { bookingPassengers, bookings, trips } from './bookings.schema.js';
import { toLocalIso } from './bookings.service.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** A ticket is accepted from 12 hours before to 12 hours after the passenger's boarding time. */
const BOARDING_WINDOW_MS = 12 * 3600_000;

const ticketNotFound = () =>
  new ApiException('NOT_FOUND', 'Ticket not found for this organization', HttpStatus.NOT_FOUND);
const ticketInvalid = (message: string) =>
  new ApiException('CONFLICT', message, HttpStatus.CONFLICT);

@Injectable()
export class TicketsService {
  constructor(
    private readonly database: DatabaseService,
    private readonly stops: StopsService,
    private readonly audit: AuditService,
  ) {}

  /** Checks a scanned ticket and marks the passenger as boarded on the first scan. */
  async validate(
    access: OrganizationAccess,
    qr: string,
    auth: Authenticated,
    meta: RequestMeta,
    now = Date.now(),
  ): Promise<TicketValidation> {
    const payload = qr.trim();
    const ticketId = payload.startsWith(TICKET_QR_PREFIX)
      ? payload.slice(TICKET_QR_PREFIX.length)
      : '';
    if (!UUID.test(ticketId)) throw ticketNotFound();

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
      .where(
        and(eq(bookingPassengers.id, ticketId), eq(trips.organizationId, access.organization.id)),
      );
    if (!row) throw ticketNotFound();
    const { passenger, booking } = row;
    if (booking.status !== 'confirmed' || !passenger.active) {
      throw ticketInvalid(`This ticket is not valid: the booking is ${booking.status}`);
    }
    const boarding = booking.departsAt.getTime();
    if (Math.abs(now - boarding) > BOARDING_WINDOW_MS) {
      throw ticketInvalid(
        `This ticket is for the departure of ${toLocalIso(booking.departsAt).slice(0, 16)}`,
      );
    }

    const [boarded] = await this.database.db
      .update(bookingPassengers)
      .set({ boardedAt: new Date(now), boardedByUserId: auth.user.id })
      .where(and(eq(bookingPassengers.id, passenger.id), isNull(bookingPassengers.boardedAt)))
      .returning({ boardedAt: bookingPassengers.boardedAt });
    if (boarded) {
      await this.audit.record({
        action: 'ticket.boarded',
        actorUserId: auth.user.id,
        targetType: 'booking',
        targetId: booking.id,
        ip: meta.ip,
        metadata: { organizationId: access.organization.id, seatNumber: passenger.seatNumber },
      });
    }
    const stops = await this.stops.summaries([booking.fromStopId, booking.toStopId]);
    return {
      result: boarded ? 'boarded' : 'already_boarded',
      boardedAt: (boarded?.boardedAt ?? passenger.boardedAt)!.toISOString(),
      bookingCode: booking.code,
      bookingStatus: booking.status,
      seatNumber: passenger.seatNumber,
      passengerName: `${passenger.firstName} ${passenger.lastName}`,
      documentNumber: `${passenger.documentType}-${passenger.documentNumber}`,
      route: row.route,
      serviceDate: row.trip.serviceDate,
      departsAt: toLocalIso(booking.departsAt),
      from: stops.get(booking.fromStopId)!,
      to: stops.get(booking.toStopId)!,
    };
  }
}
