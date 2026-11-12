import type { Currency, StopSummary, TransportMode } from './network.js';
import type { Payment } from './payments.js';

/**
 * Trip packs (ADR-028): trips on one fixed stretch (two stops, both directions) in one kind of
 * vehicle, bought in advance from the platform and spent when booking a departure of any operator
 * that accepts them. Packs expire and are not refunded (decided by the product owner).
 */

export const DEFAULT_TRIP_PACK_VALIDITY_DAYS = 60;

/** Packs with trips left are reminded this many days before they expire. */
export const TRIP_PACK_EXPIRY_NOTICE_DAYS = 3;

export const TRIP_PACK_LIMITS = {
  minTrips: 2,
  maxTrips: 100,
  maxValidityDays: 365,
  /** Unused future bookings one pack can hold at a time (decided by the product owner). */
  maxFutureBookings: 4,
  /** Packs one user can have waiting for payment at a time (so unpaid ones do not pile up). */
  maxUnpaid: 2,
  /** A bought pack waits this long for its payment before it is voided. */
  paymentHours: 24,
} as const;

/**
 * `pending_payment` → bought, waiting for the money. `active` → usable until `expiresAt`.
 * `exhausted` (no trips left), `expired` (unused trips are lost) and `cancelled` (never paid)
 * are final.
 */
export const TRIP_PACK_STATUSES = [
  'pending_payment',
  'active',
  'exhausted',
  'expired',
  'cancelled',
] as const;
export type TripPackStatus = (typeof TRIP_PACK_STATUSES)[number];

/** What the platform sells: `GET /trip-pack-products` (public) and the admin catalog. */
export interface TripPackProduct {
  id: string;
  serviceArea: { id: string; name: string };
  /** The two ends of the stretch; the pack works in both directions. */
  stops: [StopSummary, StopSummary];
  mode: TransportMode;
  trips: number;
  price: string;
  currency: Currency;
  /** `price ÷ trips`, two decimals. */
  unitPrice: string;
  validityDays: number;
  /**
   * The most the platform pays an operator per trip used, in the pack's currency; null: the
   * operator's fare, whatever it is (ADR-028). Protects the platform if fares go up after sale.
   */
  maxFare: string | null;
  /** Inactive products are not sold; packs already bought keep working. */
  active: boolean;
}

/** `POST /admin/trip-pack-products` and `PATCH …/:productId` (all optional on PATCH). */
export interface TripPackProductInput {
  serviceAreaId: string;
  stopIds: [string, string];
  mode: TransportMode;
  trips: number;
  price: string;
  currency: Currency;
  validityDays?: number;
  /** Null or omitted on create: no cap. */
  maxFare?: string | null;
  active?: boolean;
}

/** A pack someone bought. The product's terms are copied at purchase and never change. */
export interface TripPack {
  id: string;
  /** Shown to the passenger and written in the payment concept, e.g. `PAQ-7K3QXA`. */
  code: string;
  productId: string;
  serviceArea: { id: string; name: string };
  stops: [StopSummary, StopSummary];
  mode: TransportMode;
  trips: number;
  remaining: number;
  price: string;
  currency: Currency;
  unitPrice: string;
  validityDays: number;
  status: TripPackStatus;
  /** Until when a pending pack waits for its payment. */
  paymentDueAt: string | null;
  /** Set when it is paid: activation + `validityDays`. */
  expiresAt: string | null;
  activatedAt: string | null;
  /** The payment being made or verified, or the one that paid it. */
  payment: Payment | null;
  createdAt: string;
}

/** Minutes before boarding until which a trip booked with a pack goes back to it if cancelled. */
export const TRIP_PACK_RETURN_MINUTES = 30;

/**
 * Whether `pack` can pay for this departure: active with trips left, the same kind of vehicle and
 * corridor, the stretch in either direction, an operator that accepts packs, and boarding before
 * the pack expires. The API checks the same and the booking limits.
 */
export function packFits(
  pack: Pick<TripPack, 'status' | 'remaining' | 'mode' | 'serviceArea' | 'stops' | 'expiresAt'>,
  departure: {
    mode: TransportMode;
    serviceAreaId: string | null;
    acceptsTripPacks: boolean;
    from: { id: string };
    to: { id: string };
    departsAt: string;
  },
  seats = 1,
): boolean {
  return (
    pack.status === 'active' &&
    pack.remaining >= seats &&
    departure.acceptsTripPacks &&
    pack.mode === departure.mode &&
    pack.serviceArea.id === departure.serviceAreaId &&
    packCovers([pack.stops[0].id, pack.stops[1].id], departure.from.id, departure.to.id) &&
    pack.expiresAt !== null &&
    Date.parse(departure.departsAt) < Date.parse(pack.expiresAt)
  );
}

/** `POST /me/trip-packs` */
export interface BuyTripPackRequest {
  productId: string;
}

/** `price ÷ trips` with two decimals, rounded half up: `"20.00" ÷ 3` → `"6.67"`. */
export function unitPriceOf(price: string, trips: number): string {
  const cents = Math.round(Number(price) * 100);
  return (Math.round(cents / trips) / 100).toFixed(2);
}

/** Whether a pack of stretch `[a, b]` covers a trip from `from` to `to` (either direction). */
export function packCovers(stops: readonly [string, string], from: string, to: string): boolean {
  return (stops[0] === from && stops[1] === to) || (stops[0] === to && stops[1] === from);
}
