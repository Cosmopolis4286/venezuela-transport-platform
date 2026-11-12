import { DEFAULT_LOCALE, type Locale } from '../i18n/locales.js';
import { SHARED_MESSAGES } from '../i18n/shared-messages.js';
import type { TripVehicle } from './dispatch.js';
import type { Currency, StopSummary, TransportMode } from './network.js';
import type { Organization } from './organizations.js';

/**
 * Taxis to and from the terminals. A passenger asks for a taxi at a terminal; every active taxi
 * line that serves it sees the request, and the first driver (or dispatcher) to take it wins.
 * The line quotes the fare when it accepts; for now the passenger pays the driver directly.
 */

/**
 * `terminal`: to or from a terminal (intercity). `stretch`: on demand between two stops of a
 * suburban corridor, by taxi or motorcycle, now or at a set time, at the line's fixed fare for the
 * stretch (ADR-028).
 */
export const TAXI_RIDE_KINDS = ['terminal', 'stretch'] as const;
export type TaxiRideKind = (typeof TAXI_RIDE_KINDS)[number];

/** Kinds of vehicle that ride on demand. */
export const ON_DEMAND_MODES = ['car', 'motorcycle'] as const satisfies readonly TransportMode[];
export type OnDemandMode = (typeof ON_DEMAND_MODES)[number];

/** A ride booked for a time is offered from the moment it is asked, up to this far ahead. */
export const MAX_SCHEDULE_AHEAD_DAYS = 7;

/** `from_terminal`: picked up at the terminal. `to_terminal`: dropped off there. */
export const TAXI_DIRECTIONS = ['from_terminal', 'to_terminal'] as const;
export type TaxiDirection = (typeof TAXI_DIRECTIONS)[number];

export const TAXI_DIRECTION_LABELS: Record<TaxiDirection, string> =
  SHARED_MESSAGES.es.taxiDirection;

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
export const MAX_TAXI_PASSENGERS = 6;

/** `GET /taxi/terminals` — terminals with at least one active taxi line. */
export type TaxiTerminal = StopSummary & { lines: number };

/** `POST /me/taxi-rides` */
export interface RequestTaxiRequest {
  /** Defaults to `terminal`. */
  kind?: TaxiRideKind;
  /** Terminal rides. */
  terminalStopId?: string;
  direction?: TaxiDirection;
  /** Stretch rides: both stops of one active corridor, the kind of vehicle, and when. */
  fromStopId?: string;
  toStopId?: string;
  mode?: OnDemandMode;
  /** Omitted: now. ISO instant, up to `MAX_SCHEDULE_AHEAD_DAYS` ahead. */
  scheduledFor?: string;
  /**
   * Terminal rides: the other end of the ride. Stretch rides: where to pick the passenger up,
   * near the origin stop (no map: the line decides if it gets there).
   */
  address: string;
  notes?: string;
  /** A motorcycle carries one. */
  passengers: number;
  /**
   * Stretch rides: pay with one of the passenger's trip packs (one trip per passenger, spent when
   * asked; ADR-028). Omitted: the passenger pays the driver.
   */
  tripPackId?: string;
  /** Shown to the driver once accepted; defaults to the account's verified phone. */
  contactPhone?: string;
}

/** A ride as its passenger sees it. */
export interface TaxiRide {
  id: string;
  kind: TaxiRideKind;
  status: TaxiRideStatus;
  /** Terminal rides. */
  terminal: StopSummary | null;
  direction: TaxiDirection | null;
  /** Stretch rides. */
  from: StopSummary | null;
  to: StopSummary | null;
  mode: OnDemandMode;
  /** Booked for this instant; null: as soon as possible. */
  scheduledFor: string | null;
  /** The trip pack that pays it; null: the passenger pays the driver. */
  tripPack: { id: string; code: string } | null;
  /**
   * Stretch rides a line took: cancelling is free until this instant; afterwards it costs
   * `lateCancellationFee`, paid on the next ride. Null when cancelling is free anyway.
   */
  freeCancellationUntil: string | null;
  lateCancellationFee: { amount: string; currency: Currency } | null;
  /**
   * When the driver is late (no pickup by then), cancelling is free again; null with no fee.
   * `RIDE_PICKUP_GRACE_MINUTES` after it was taken, or after the time asked.
   */
  lateCancellationEndsAt: string | null;
  /** Fees of earlier late cancellations the passenger pays the driver on this ride, in cash. */
  feesDue: { amount: string; currency: Currency }[];
  address: string;
  notes: string | null;
  passengers: number;
  fare: { amount: string; currency: Currency } | null;
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
  kind: TaxiRideKind;
  terminal: StopSummary | null;
  direction: TaxiDirection | null;
  from: StopSummary | null;
  to: StopSummary | null;
  mode: OnDemandMode;
  scheduledFor: string | null;
  /** Paid with a trip pack: the driver charges nothing. */
  paidWithPack: boolean;
  /** Cancellation fees the driver collects in cash on this ride, on top of the fare. */
  feesDue: { amount: string; currency: Currency }[];
  address: string;
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
}

/** Taking a request: by the driver (`POST /me/taxi/rides/:id/accept`) or a dispatcher. */
export interface AcceptTaxiRideRequest {
  /** The driver's taxi line (drivers may belong to several). */
  organizationId: string;
  vehicleId: string;
  /** Terminal rides only: stretch rides cost the line's fixed fare for the stretch. */
  fareAmount?: string;
  fareCurrency?: Currency;
}

export interface AssignTaxiRideRequest extends Omit<AcceptTaxiRideRequest, 'organizationId'> {
  driverUserId: string;
}

/** `GET /me/taxi` — what a taxi driver needs on one screen. */
export interface DriverTaxiBoard {
  /** The ride the driver is on, or the next one due, if any (one at a time on the road). */
  current: OperatorTaxiRide | null;
  /** Rides booked for later that the driver took, soonest first. */
  upcoming: OperatorTaxiRide[];
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

/** A line's fixed fare for riding on demand between two stops (either way), by vehicle. */
export interface OnDemandFare {
  serviceAreaId: string;
  stops: [StopSummary, StopSummary];
  mode: OnDemandMode;
  amount: string;
  currency: Currency;
}

/** `PUT /organizations/:id/taxi/stretch-fares` replaces all of them. */
export interface ReplaceOnDemandFaresRequest {
  fares: { stopIds: [string, string]; mode: OnDemandMode; amount: string; currency: Currency }[];
}

/**
 * `GET /taxi/stretch-options?from=&to=` (public): per vehicle, how many lines ride that stretch on
 * demand and their fares, so the passenger sees the price before asking.
 */
export interface StretchOption {
  mode: OnDemandMode;
  lines: number;
  currency: Currency;
  minFare: string;
  maxFare: string;
}

/** `GET /me/taxi-fees`: late-cancellation fees the passenger still owes (paid on the next ride). */
export interface PendingRideFee {
  id: string;
  amount: string;
  currency: Currency;
  createdAt: string;
}

/** `PUT /organizations/:id/taxi/terminals` — where the line picks up and drops off. */
export interface ReplaceTaxiTerminalsRequest {
  stopIds: string[];
}

/** What the passenger should do next, in `locale`. */
/**
 * A stretch ride a line took should be picked up within this many minutes of being taken (or of
 * the time asked): later, the passenger cancels for free (the driver is late, ADR-030).
 */
export const RIDE_PICKUP_GRACE_MINUTES = 20;

/**
 * Rides left open (never picked up, or never completed) close on their own after these hours,
 * so the passenger is not blocked from asking for another one.
 */
export const RIDE_ABANDONED_HOURS = { accepted: 2, inProgress: 6 } as const;

export function taxiRideHint(
  ride: Pick<TaxiRide, 'status' | 'direction'> & { kind?: TaxiRideKind },
  locale: Locale = DEFAULT_LOCALE,
): string {
  const hints = SHARED_MESSAGES[locale].taxiRideHint;
  if (ride.kind === 'stretch' && ride.status === 'requested') return hints.requestedStretch;
  if (ride.status !== 'accepted') return hints[ride.status];
  if (ride.kind === 'stretch') return hints.acceptedStretch;
  return ride.direction === 'from_terminal' ? hints.acceptedFromTerminal : hints.acceptedToTerminal;
}

/** `+584141234567` → `0414-1234567`, how Venezuelans write phone numbers; others unchanged. */
export function localPhone(e164: string): string {
  const match = /^\+58(\d{3})(\d{7})$/.exec(e164);
  return match ? `0${match[1]}-${match[2]}` : e164;
}
