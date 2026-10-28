import type { TripDriver, TripVehicle } from './dispatch.js';
import type { IdentityDocumentType } from './onboarding.js';
import type { LayoutSeat } from './fleet.js';
import type { Currency, ServiceClass, StopSummary } from './network.js';
import type { Organization } from './organizations.js';
import type { Payment } from './payments.js';

/**
 * Trips and bookings. A trip is one schedule on one service date; it is created the first time
 * someone books it and keeps a snapshot of the seat map, so later layout edits never move a seat
 * that was already sold. A seat is taken for the whole trip, whatever segment the passenger rides.
 */

export const MAX_SEATS_PER_BOOKING = 6;

/**
 * `held` → seats reserved until `expiresAt` while the passenger pays. `confirmed` → paid, tickets
 * issued. `cancelled` by the passenger or operator. `expired` → the hold ran out unpaid.
 */
export const BOOKING_STATUSES = ['held', 'confirmed', 'cancelled', 'expired'] as const;
export type BookingStatus = (typeof BOOKING_STATUSES)[number];

export const BOOKING_STATUS_LABELS: Record<BookingStatus, string> = {
  held: 'Apartada, pendiente de pago',
  confirmed: 'Confirmada',
  cancelled: 'Cancelada',
  expired: 'Vencida',
};

/** What the operator sells for one departure, as seen from a pair of stops. */
export interface TripAvailability {
  scheduleId: string;
  serviceDate: string;
  operator: Pick<Organization, 'id' | 'type' | 'legalName' | 'tradeName'>;
  route: { id: string; name: string };
  from: StopSummary;
  to: StopSummary;
  /** Local ISO with the Venezuelan offset. */
  departsAt: string;
  arrivesAt: string;
  serviceClass: ServiceClass;
  /** Seat map, or null when the schedule only has a seat count (seats are then `1`…`capacity`). */
  layout: { decks: number; rows: number; columns: number; seats: LayoutSeat[] } | null;
  capacity: number;
  /** Seat numbers already held or sold. */
  takenSeats: string[];
  /** Price per passenger for this pair of stops; null means it cannot be booked online. */
  fare: { amount: string; currency: Currency } | null;
  /** False once the departure has left or the hold window cannot fit. */
  bookable: boolean;
}

export interface PassengerInput {
  seatNumber: string;
  firstName: string;
  lastName: string;
  documentType: IdentityDocumentType;
  documentNumber: string;
}

/** `POST /api/v1/bookings` — holds the seats for `BOOKING_HOLD_MINUTES`. */
export interface CreateBookingRequest {
  scheduleId: string;
  serviceDate: string;
  fromStopId: string;
  toStopId: string;
  passengers: PassengerInput[];
}

export interface BookingPassenger extends PassengerInput {
  /** Per passenger, in the fare's currency. */
  fare: string;
  /** Issued once the booking is confirmed. `qr` is the payload to render as a QR code. */
  ticket: { qr: string; boardedAt: string | null } | null;
}

export interface Booking {
  id: string;
  /** Short code for the counter and the ticket, e.g. `VTP-7K3QXA`. */
  code: string;
  status: BookingStatus;
  trip: {
    id: string;
    scheduleId: string;
    serviceDate: string;
    departsAt: string;
    arrivesAt: string;
    serviceClass: ServiceClass;
  };
  operator: Pick<Organization, 'id' | 'type' | 'legalName' | 'tradeName'>;
  route: { id: string; name: string };
  from: StopSummary;
  to: StopSummary;
  passengers: BookingPassenger[];
  total: { amount: string; currency: Currency };
  /** Only for `held`. */
  expiresAt: string | null;
  /** The payment in progress, or the one that confirmed (or must be refunded for) the booking. */
  payment: Payment | null;
  createdAt: string;
}

/** A trip as the operator sees it (`GET /organizations/:id/trips?date=`). */
export interface TripSummary {
  id: string;
  scheduleId: string;
  serviceDate: string;
  route: { id: string; name: string };
  departureTime: string;
  serviceClass: ServiceClass;
  capacity: number;
  /** Seats in confirmed bookings. */
  soldSeats: number;
  /** Seats in unexpired holds. */
  heldSeats: number;
  /** Assigned by a dispatcher. */
  vehicle: TripVehicle | null;
  driver: TripDriver | null;
}

/** `GET /organizations/:id/trips/:tripId/manifest` — passenger list for boarding. */
export interface TripManifest extends TripSummary {
  passengers: (PassengerInput & {
    bookingCode: string;
    bookingStatus: BookingStatus;
    from: StopSummary;
    to: StopSummary;
    /** When the ticket was scanned at boarding. */
    boardedAt: string | null;
  })[];
}
