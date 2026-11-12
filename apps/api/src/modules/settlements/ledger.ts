import {
  defaultPayee,
  type PaymentCollection,
  type RefundTier,
  type SettlementPolicy,
} from '@vtp/shared-types';
import { and, count, eq } from 'drizzle-orm';
import type { Database, Transaction } from '../../database/database.service.js';
import { bookingPassengers, bookings, trips } from '../bookings/bookings.schema.js';
import { operatingZones, routes, stops } from '../network/network.schema.js';
import { fromScaled, toScaled } from '../payments/money.js';
import { organizationPolicies, platformSettings, settlementEntries } from './settlements.schema.js';

/** Rounds `numerator / denominator` half up (both non-negative). */
const divideRounded = (numerator: bigint, denominator: bigint) =>
  (numerator * 2n + denominator) / (denominator * 2n);

/**
 * Commission on `gross` at `rate` percent, rounded half up to cents; the operator earns the rest.
 * Integer arithmetic only: cents × basis points / 10 000.
 */
export function splitFare(gross: string, rate: string): { commission: string; earned: string } {
  const cents = toScaled(gross, 2);
  const commission = divideRounded(cents * toScaled(rate, 2), 10_000n);
  return { commission: fromScaled(commission, 2), earned: fromScaled(cents - commission, 2) };
}

/**
 * The service fee the passenger pays on top of `fares` at `rate` percent (ADR-029), rounded half
 * up to cents, and the total charged.
 */
export function withServiceFee(fares: string, rate: string): { fee: string; total: string } {
  const { commission } = splitFare(fares, rate);
  return { fee: commission, total: fromScaled(toScaled(fares, 2) + toScaled(commission, 2), 2) };
}

/** `amount × part / whole`, rounded half up to cents (e.g. the fare share of a payment). */
export function shareOf(amount: string, part: string, whole: string): string {
  const total = toScaled(whole, 2);
  if (total === 0n) return fromScaled(0n, 2);
  return fromScaled(divideRounded(toScaled(amount, 2) * toScaled(part, 2), total), 2);
}

/** `percent` (whole number) of `amount`, rounded half up to cents. */
export function percentOf(amount: string, percent: number): string {
  return fromScaled(divideRounded(toScaled(amount, 2) * BigInt(percent), 100n), 2);
}

/**
 * What a cancellation takes back from the ledger when `refund` (fare currency) goes back to the
 * passenger. The platform keeps its commission (ADR-025): the refund comes out of what the
 * operator earned, and only the part beyond that (a refund close to 100 %) out of the commission.
 */
export function splitRefund(
  refund: string,
  earned: string,
): { fromEarned: string; fromCommission: string } {
  const total = toScaled(refund, 2);
  const fromEarned = total < toScaled(earned, 2) ? total : toScaled(earned, 2);
  return {
    fromEarned: fromScaled(fromEarned, 2),
    fromCommission: fromScaled(total - fromEarned, 2),
  };
}

/** `"8.5"` → `"8.50"`. */
export const normalizeRate = (rate: string) => fromScaled(toScaled(rate, 2), 2);

/** The platform's defaults merged with the operator's own values. */
export async function policyFor(
  db: Database | Transaction,
  organizationId: string,
): Promise<
  SettlementPolicy & {
    commissionOverride: string | null;
    refundTiersOverride: RefundTier[] | null;
    paymentCollection: PaymentCollection;
  }
> {
  const [platform] = await db.select().from(platformSettings).where(eq(platformSettings.id, 1));
  if (!platform) throw new Error('platform_settings has no row: run the migrations');
  const [own] = await db
    .select()
    .from(organizationPolicies)
    .where(eq(organizationPolicies.organizationId, organizationId));
  return {
    commissionRate: own?.commissionRate ?? platform.commissionRate,
    refundTiers: own?.refundTiers ?? platform.refundTiers,
    commissionOverride: own?.commissionRate ?? null,
    refundTiersOverride: own?.refundTiers ?? null,
    paymentCollection: own?.paymentCollection ?? 'platform',
  };
}

/**
 * The commission for a sale: the company's own rate, else the rate of the zone where the
 * passenger boards (ADR-028), else the platform's.
 */
export async function commissionFor(
  db: Database | Transaction,
  organizationId: string,
  boardingStopId: string,
): Promise<string> {
  const policy = await policyFor(db, organizationId);
  if (policy.commissionOverride !== null) return policy.commissionOverride;
  const [zone] = await db
    .select({ rate: operatingZones.commissionRate })
    .from(stops)
    .innerJoin(operatingZones, eq(operatingZones.id, stops.zoneId))
    .where(eq(stops.id, boardingStopId));
  return zone?.rate ?? policy.commissionRate;
}

/**
 * Writes what a booking that was just confirmed earns its operator, with the commission in force
 * now, and who received the money. Runs inside the confirming transaction; a second call for the
 * same booking does nothing.
 */
export async function recordEarning(
  tx: Transaction,
  bookingId: string,
  collectedBy: PaymentCollection = 'platform',
): Promise<void> {
  const [row] = await tx
    .select({
      organizationId: trips.organizationId,
      gross: bookings.totalAmount,
      currency: bookings.currency,
      fromStopId: bookings.fromStopId,
      serviceFee: bookings.serviceFee,
      serviceFeeRate: bookings.serviceFeeRate,
      scope: routes.scope,
      payeeOverride: routes.payeeOverride,
    })
    .from(bookings)
    .innerJoin(trips, eq(trips.id, bookings.tripId))
    .innerJoin(routes, eq(routes.id, trips.routeId))
    .where(eq(bookings.id, bookingId));
  if (!row) throw new Error(`Booking ${bookingId} not found`);
  const [seats] = await tx
    .select({ n: count() })
    .from(bookingPassengers)
    .where(and(eq(bookingPassengers.bookingId, bookingId), eq(bookingPassengers.active, true)));
  // Since ADR-029 the commission is the service fee the passenger paid on top of the fares:
  // the operator earns its fares in full. Older bookings had it taken out of the fare.
  const surcharge =
    row.serviceFee !== null && row.serviceFeeRate !== null
      ? {
          commissionRate: row.serviceFeeRate,
          commission: row.serviceFee,
          earned: fromScaled(toScaled(row.gross, 2) - toScaled(row.serviceFee, 2), 2),
        }
      : null;
  const commissionRate =
    surcharge?.commissionRate ??
    normalizeRate(await commissionFor(tx, row.organizationId, row.fromStopId));
  await tx
    .insert(settlementEntries)
    .values({
      organizationId: row.organizationId,
      bookingId,
      collectedBy,
      // A route paid to drivers (ADR-030) owes its fares to the trip's driver, when the platform
      // holds the money; when the operator collects, it pays its own drivers.
      payee:
        collectedBy === 'platform' && (row.payeeOverride ?? defaultPayee(row.scope)) === 'driver'
          ? 'driver'
          : 'organization',
      seats: seats?.n ?? 0,
      currency: row.currency,
      gross: row.gross,
      commissionRate,
      ...(surcharge
        ? { commission: surcharge.commission, earned: surcharge.earned }
        : splitFare(row.gross, commissionRate)),
    })
    .onConflictDoNothing({ target: [settlementEntries.bookingId, settlementEntries.kind] });
}

/**
 * Takes a cancelled booking's refund out of the ledger (negative amounts), inside the cancelling
 * transaction. Bookings paid before the ledger existed have no entry and are left alone.
 */
export async function recordCancellation(
  tx: Transaction,
  bookingId: string,
  fareRefund: string,
  /**
   * The operator cancelled the departure: the whole refund comes out of what it earned, and the
   * platform keeps its commission even on a full refund.
   */
  operatorCancelled = false,
): Promise<void> {
  const [earning] = await tx
    .select()
    .from(settlementEntries)
    .where(and(eq(settlementEntries.bookingId, bookingId), eq(settlementEntries.kind, 'booking')));
  if (!earning) return;
  const { fromEarned, fromCommission } = operatorCancelled
    ? { fromEarned: fareRefund, fromCommission: '0.00' }
    : splitRefund(fareRefund, earning.earned);
  const negative = (amount: string) => (toScaled(amount, 2) === 0n ? '0.00' : `-${amount}`);
  await tx
    .insert(settlementEntries)
    .values({
      organizationId: earning.organizationId,
      bookingId,
      kind: 'cancellation',
      collectedBy: earning.collectedBy,
      payee: earning.payee,
      seats: -earning.seats,
      currency: earning.currency,
      gross: negative(fareRefund),
      commissionRate: earning.commissionRate,
      commission: negative(fromCommission),
      earned: negative(fromEarned),
    })
    .onConflictDoNothing({ target: [settlementEntries.bookingId, settlementEntries.kind] });
}
