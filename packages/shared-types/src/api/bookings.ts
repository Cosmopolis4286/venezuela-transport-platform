import type { InvoiceBuyer, InvoiceStatus } from './fiscal.js';
import { SHARED_MESSAGES } from '../i18n/shared-messages.js';
import type { TripDriver, TripVehicle } from './dispatch.js';
import type { IdentityDocumentType } from './onboarding.js';
import type { LayoutSeat } from './fleet.js';
import type { Currency, ServiceClass, StopSummary } from './network.js';
import type { Organization } from './organizations.js';
import type { Payment } from './payments.js';
import type { RefundTier } from './settlements.js';

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

export const BOOKING_STATUS_LABELS: Record<BookingStatus, string> =
  SHARED_MESSAGES.es.bookingStatus;

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
  /** Platform service fee (percentage) added on top of the fares (ADR-029). */
  serviceFeeRate: string;
  /** False once the departure has left or the hold window cannot fit. */
  bookable: boolean;
  /** Frequency service: open tickets without seats (see `Departure`). */
  headwayMinutes: number | null;
  lastDepartsAt: string | null;
}

export interface PassengerInput {
  /** Omitted on frequency departures: the ticket is open and the API numbers it. */
  seatNumber?: string;
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
  /** The seat, or the ticket number of the day on an open ticket. */
  seatNumber: string;
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
    /** Set when the operator cancelled the whole departure (every passenger is refunded in full). */
    cancellation: { reason: string } | null;
    /**
     * Set on an open ticket (frequency service): valid on any unit of the route that day, from
     * the booking's `departsAt` (first unit) to its `arrivesAt` (arrival of the last one).
     */
    headwayMinutes: number | null;
  };
  operator: Pick<Organization, 'id' | 'type' | 'legalName' | 'tradeName'>;
  route: { id: string; name: string };
  from: StopSummary;
  to: StopSummary;
  passengers: BookingPassenger[];
  /** What the passenger pays: the fares plus the service fee. */
  total: { amount: string; currency: Currency };
  /** The fares alone (what the operator earns), in the fare's currency. */
  fares: string;
  /**
   * The platform's service fee, on top of the fares and not refunded when the passenger cancels
   * (ADR-029). Null on bookings made before the fee existed.
   */
  serviceFee: { amount: string; rate: string } | null;
  /** Only for `held`. */
  expiresAt: string | null;
  /** The payment in progress, or the one that confirmed (or must be refunded for) the booking. */
  payment: Payment | null;
  /**
   * The operator's refund tiers in force now, so the passenger sees them before paying. The
   * exact amount is quoted at cancellation time (`GET /me/bookings/:id/cancellation`).
   */
  refundPolicy: RefundTier[];
  /** Who the service-fee invoice is for, when the passenger asked for another name (ADR-031). */
  billing: InvoiceBuyer | null;
  /** The platform's invoice for the service fee, once the booking is paid. */
  invoice: BookingInvoice | null;
  createdAt: string;
}

export interface BookingInvoice {
  status: InvoiceStatus;
  /** Set when issued. */
  number: string | null;
  controlNumber: string | null;
  issuedOn: string | null;
}

/**
 * `GET /admin/bookings/by-code/:code`: platform staff find a booking by the code a passenger
 * sends to support (WhatsApp, e-mail), with how to reach the passenger.
 */
export interface AdminBookingLookup {
  booking: Booking;
  customer: { name: string | null; email: string | null; phone: string | null };
}

/**
 * `PUT /me/bookings/:id/billing`: invoice the service fee to another name (or back to the first
 * passenger with `null`), while the invoice is not issued yet.
 */
export interface SetBookingBillingRequest {
  billing: InvoiceBuyer | null;
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
  /** Marked by the driver when the bus leaves the origin and reaches the last stop (UTC ISO). */
  departedAt: string | null;
  arrivedAt: string | null;
  /** The operator cancelled this departure: why and when (UTC ISO); null otherwise. */
  cancellation: { reason: string; at: string } | null;
}

/** `GET /organizations/:id/trips/:tripId/manifest` — passenger list for boarding. */
export interface TripManifest extends TripSummary {
  passengers: (PassengerInput & {
    seatNumber: string;
    bookingCode: string;
    bookingStatus: BookingStatus;
    from: StopSummary;
    to: StopSummary;
    /** When the ticket was scanned at boarding. */
    boardedAt: string | null;
  })[];
}
