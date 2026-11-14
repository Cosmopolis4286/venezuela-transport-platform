import { DEFAULT_LOCALE, type Locale } from '../i18n/locales.js';
import { SHARED_MESSAGES } from '../i18n/shared-messages.js';
import type { TripVehicle } from './dispatch.js';
import type { Currency, StopSummary } from './network.js';
import type { Organization } from './organizations.js';

/**
 * Taxis to and from the terminals. A passenger asks for a taxi at a terminal; every active taxi
 * line that serves it sees the request, and the first driver (or dispatcher) to take it wins.
 * The line quotes the fare when it accepts; for now the passenger pays the driver directly.
 */

/**
 * `from_terminal`: picked up at the terminal. `to_terminal`: dropped off there. `local`: from
 * `address` to `destination` in the area the terminal (or taxi stand) serves (ADR-035).
 */
export const TAXI_DIRECTIONS = ['from_terminal', 'to_terminal', 'local'] as const;
export type TaxiDirection = (typeof TAXI_DIRECTIONS)[number];

export const TAXI_DIRECTION_LABELS: Record<TaxiDirection, string> =
  SHARED_MESSAGES.es.taxiDirection;

/** A car taxi or a motorcycle taxi (one passenger). */
export const TAXI_VEHICLE_TYPES = ['car', 'moto'] as const;
export type TaxiVehicleType = (typeof TAXI_VEHICLE_TYPES)[number];

export const TAXI_VEHICLE_TYPE_LABELS: Record<TaxiVehicleType, string> =
  SHARED_MESSAGES.es.taxiVehicleType;

/** How the ride was asked for: in the passenger app, or by platform staff for a WhatsApp chat. */
export const TAXI_CHANNELS = ['app', 'whatsapp'] as const;
export type TaxiChannel = (typeof TAXI_CHANNELS)[number];

/** Passengers per vehicle type. */
export const MAX_MOTO_PASSENGERS = 1;

/**
 * `requested` → `accepted` (driver, vehicle and fare set) → `in_progress` (passenger on board) →
 * `completed`. A passenger may cancel before pickup; a line may release an accepted ride back to
 * `requested`. Requests nobody takes in `TAXI_REQUEST_MINUTES` become `expired`.
 */
export const TAXI_RIDE_STATUSES = [
  'requested',
  'accepted',
  'in_progress',
  'completed',
  'cancelled',
  'expired',
] as const;
export type TaxiRideStatus = (typeof TAXI_RIDE_STATUSES)[number];

export const TAXI_RIDE_STATUS_LABELS: Record<TaxiRideStatus, string> =
  SHARED_MESSAGES.es.taxiRideStatus;

/** Statuses in which a ride still needs something to happen. */
export const OPEN_TAXI_RIDE_STATUSES = ['requested', 'accepted', 'in_progress'] as const;

export const TAXI_REQUEST_MINUTES = 20;

/** A WhatsApp tracking link works this many days after the request (to cancel, follow and rate). */
export const TAXI_TRACKING_DAYS = 7;
export const MAX_TAXI_PASSENGERS = 6;

/** `GET /taxi/terminals` — terminals with at least one active taxi line. */
export type TaxiTerminal = StopSummary & { lines: number };

/** `POST /me/taxi-rides` */
export interface RequestTaxiRequest {
  terminalStopId: string;
  direction: TaxiDirection;
  /** The other end of the ride (pickup for `local`): street, sector, a reference point. */
  address: string;
  /** Required for `local`: where the passenger goes. */
  destination?: string;
  /** Default `car`. A `moto` takes one passenger. */
  vehicleType?: TaxiVehicleType;
  notes?: string;
  passengers: number;
  /** Shown to the driver once accepted; defaults to the account's verified phone. */
  contactPhone?: string;
}

/**
 * `POST /admin/taxi-rides`: platform staff ask for a taxi for someone who wrote on WhatsApp
 * (ADR-035). The person gets a tracking link instead of an app.
 */
export interface AssistedTaxiRequest extends Omit<RequestTaxiRequest, 'contactPhone'> {
  customerName: string;
  customerPhone: string;
}

/** A ride staff asked for, with the link and message to send back on WhatsApp. */
export interface AssistedTaxiRide {
  ride: TaxiRide;
  customer: { name: string; phone: string };
  /** Path of the public tracking page under the web's language, e.g. `/taxi/Xy…`. */
  trackingPath: string;
}

/** `GET /taxi/track/:token`: what anyone with the link sees (no account). */
export interface PublicTaxiRide {
  status: TaxiRideStatus;
  vehicleType: TaxiVehicleType;
  direction: TaxiDirection;
  terminal: string;
  address: string;
  destination: string | null;
  passengers: number;
  line: string | null;
  driverFirstName: string | null;
  vehicle: { plate: string; label: string | null } | null;
  fare: { amount: string; currency: Currency } | null;
  requestedAt: string;
  expiresAt: string;
  acceptedAt: string | null;
  pickedUpAt: string | null;
  completedAt: string | null;
  /** Before a driver picks the passenger up. */
  canCancel: boolean;
  /** Once completed, if not rated yet. */
  canRate: boolean;
  rating: number | null;
}

/** Rating a finished ride (link or app): 1 to 5 stars and an optional comment. */
export interface RateTaxiRideRequest {
  rating: number;
  comment?: string;
}

/** A ride as its passenger sees it. */
export interface TaxiRide {
  id: string;
  status: TaxiRideStatus;
  terminal: StopSummary;
  direction: TaxiDirection;
  address: string;
  destination: string | null;
  vehicleType: TaxiVehicleType;
  channel: TaxiChannel;
  notes: string | null;
  passengers: number;
  fare: { amount: string; currency: Currency } | null;
  /** 1–5 once the passenger rated the finished ride. */
  rating: number | null;
  organization: Pick<Organization, 'id' | 'legalName' | 'tradeName'> | null;
  driver: { firstName: string | null; lastName: string | null; phone: string | null } | null;
  vehicle: TripVehicle | null;
  requestedAt: string;
  /** Until when a `requested` ride waits for a taxi. */
  expiresAt: string;
  acceptedAt: string | null;
  pickedUpAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
}

/** An open request as drivers and dispatchers see it before taking it: no contact details. */
export interface TaxiRequest {
  id: string;
  terminal: StopSummary;
  direction: TaxiDirection;
  address: string;
  destination: string | null;
  vehicleType: TaxiVehicleType;
  notes: string | null;
  passengers: number;
  passengerFirstName: string | null;
  requestedAt: string;
  expiresAt: string;
}

/** A ride a line has taken, for its driver and dispatchers. */
export interface OperatorTaxiRide extends TaxiRequest {
  status: TaxiRideStatus;
  organizationId: string;
  passenger: { firstName: string | null; lastName: string | null; phone: string | null };
  driver: { userId: string; firstName: string | null; lastName: string | null };
  vehicle: TripVehicle;
  fare: { amount: string; currency: Currency };
  acceptedAt: string;
  pickedUpAt: string | null;
  completedAt: string | null;
  /** The passenger's rating of the ride (1–5) and comment, once given. */
  rating: number | null;
  ratingComment: string | null;
}

/** Taking a request: by the driver (`POST /me/taxi/rides/:id/accept`) or a dispatcher. */
export interface AcceptTaxiRideRequest {
  /** The driver's taxi line (drivers may belong to several). */
  organizationId: string;
  vehicleId: string;
  fareAmount: string;
  fareCurrency: Currency;
}

export interface AssignTaxiRideRequest extends Omit<AcceptTaxiRideRequest, 'organizationId'> {
  driverUserId: string;
}

/** `GET /me/taxi` — what a taxi driver needs on one screen. */
export interface DriverTaxiBoard {
  /** The ride the driver is on, if any (a driver takes one at a time). */
  current: OperatorTaxiRide | null;
  /** Open requests at the terminals the driver's lines serve, oldest first. */
  requests: TaxiRequest[];
  /** The driver's active taxi lines with their active vehicles. */
  lines: {
    organization: Pick<Organization, 'id' | 'legalName' | 'tradeName'>;
    vehicles: TripVehicle[];
  }[];
}

/** `GET /organizations/:id/taxi` — dispatcher's view of a taxi line. */
export interface TaxiDispatchBoard {
  terminals: StopSummary[];
  requests: TaxiRequest[];
  /** Accepted and in-progress rides of the line, plus the ones finished today. */
  rides: OperatorTaxiRide[];
  drivers: { userId: string; firstName: string | null; lastName: string | null; busy: boolean }[];
  vehicles: (TripVehicle & { busy: boolean })[];
}

/** `PUT /organizations/:id/taxi/terminals` — where the line picks up and drops off. */
export interface ReplaceTaxiTerminalsRequest {
  stopIds: string[];
}

/** What the passenger should do next, in `locale`. */
export function taxiRideHint(
  ride: Pick<TaxiRide, 'status' | 'direction'>,
  locale: Locale = DEFAULT_LOCALE,
): string {
  const hints = SHARED_MESSAGES[locale].taxiRideHint;
  if (ride.status !== 'accepted') return hints[ride.status];
  return ride.direction === 'from_terminal' ? hints.acceptedFromTerminal : hints.acceptedToTerminal;
}

/**
 * Where the ride goes, in the direction of travel: "Terminal → Av. Bolívar", "Av. Bolívar →
 * Terminal", or, within the city, "Calle Bolívar → Ambulatorio".
 */
export function taxiRideRoute(
  ride: Pick<TaxiRequest, 'direction' | 'address' | 'destination'> & {
    terminal: { name: string };
  },
): string {
  if (ride.direction === 'from_terminal') return `${ride.terminal.name} → ${ride.address}`;
  if (ride.direction === 'to_terminal') return `${ride.address} → ${ride.terminal.name}`;
  return `${ride.address} → ${ride.destination ?? '?'}`;
}

/** `+584141234567` → `0414-1234567`, how Venezuelans write phone numbers; others unchanged. */
export function localPhone(e164: string): string {
  const match = /^\+58(\d{3})(\d{7})$/.exec(e164);
  return match ? `0${match[1]}-${match[2]}` : e164;
}
