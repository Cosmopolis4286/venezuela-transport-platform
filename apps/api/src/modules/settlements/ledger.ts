import type { Currency, PaymentCollection, RefundTier, SettlementPolicy } from '@vtp/shared-types';
import { and, count, eq } from 'drizzle-orm';
import type { Database, Transaction } from '../../database/database.service.js';
import { bookingPassengers, bookings, trips } from '../bookings/bookings.schema.js';
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
    acceptsTripPacks: boolean;
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
    suburbanRefundTiers: platform.suburbanRefundTiers,
    rideCancellation: {
      freeMinutes: platform.rideFreeCancelMinutes,
      feePercent: platform.rideCancelFeePercent,
    },
    commissionOverride: own?.commissionRate ?? null,
    refundTiersOverride: own?.refundTiers ?? null,
    paymentCollection: own?.paymentCollection ?? 'platform',
    acceptsTripPacks: own?.acceptsTripPacks ?? false,
  };
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
    })
    .from(bookings)
    .innerJoin(trips, eq(trips.id, bookings.tripId))
    .where(eq(bookings.id, bookingId));
  if (!row) throw new Error(`Booking ${bookingId} not found`);
  const [seats] = await tx
    .select({ n: count() })
    .from(bookingPassengers)
    .where(and(eq(bookingPassengers.bookingId, bookingId), eq(bookingPassengers.active, true)));
  const commissionRate = normalizeRate((await policyFor(tx, row.organizationId)).commissionRate);
  await tx
    .insert(settlementEntries)
    .values({
      organizationId: row.organizationId,
      bookingId,
      collectedBy,
      seats: seats?.n ?? 0,
      currency: row.currency,
      gross: row.gross,
      commissionRate,
      ...splitFare(row.gross, commissionRate),
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
      seats: -earning.seats,
      currency: earning.currency,
      gross: negative(fareRefund),
      commissionRate: earning.commissionRate,
      commission: negative(fromCommission),
      earned: negative(fromEarned),
    })
    .onConflictDoNothing({ target: [settlementEntries.bookingId, settlementEntries.kind] });
}

/**
 * Undoes all of a booking's earning: a trip paid with a pack that went back to the pack (ADR-028).
 * Nothing was refunded in money, so the platform's commission goes back too.
 */
export async function reverseEarning(tx: Transaction, bookingId: string): Promise<void> {
  const [earning] = await tx
    .select()
    .from(settlementEntries)
    .where(and(eq(settlementEntries.bookingId, bookingId), eq(settlementEntries.kind, 'booking')));
  if (!earning) return;
  const negative = (amount: string) => (toScaled(amount, 2) === 0n ? '0.00' : `-${amount}`);
  await tx
    .insert(settlementEntries)
    .values({
      organizationId: earning.organizationId,
      bookingId,
      kind: 'cancellation',
      collectedBy: earning.collectedBy,
      seats: -earning.seats,
      currency: earning.currency,
      gross: negative(earning.gross),
      commissionRate: earning.commissionRate,
      commission: negative(earning.commission),
      earned: negative(earning.earned),
    })
    .onConflictDoNothing({ target: [settlementEntries.bookingId, settlementEntries.kind] });
}

/**
 * What a taxi or motorcycle ride paid with a trip pack earns its line, when the ride is completed
 * (ADR-028): the line's fixed fare for the stretch, minus its commission. The platform collected
 * the pack. Once per ride.
 */
export async function recordRideEarning(
  tx: Transaction,
  ride: {
    id: string;
    organizationId: string;
    passengers: number;
    fareAmount: string;
    fareCurrency: Currency;
  },
): Promise<void> {
  const commissionRate = normalizeRate((await policyFor(tx, ride.organizationId)).commissionRate);
  await tx
    .insert(settlementEntries)
    .values({
      organizationId: ride.organizationId,
      taxiRideId: ride.id,
      collectedBy: 'platform',
      seats: ride.passengers,
      currency: ride.fareCurrency,
      gross: ride.fareAmount,
      commissionRate,
      ...splitFare(ride.fareAmount, commissionRate),
    })
    .onConflictDoNothing({
      target: [
        settlementEntries.taxiRideId,
        settlementEntries.kind,
        settlementEntries.organizationId,
      ],
    });
}

/**
 * A late-cancellation fee the driver of the passenger's next ride collected in cash: the line
 * that went out earns it, minus its commission. When another line collected it, that line owes it
 * to the platform (collected by the operator, nothing earned) and the platform pays the first.
 * Once per fee (its cancelled ride).
 */
export async function recordRideFee(
  tx: Transaction,
  fee: {
    cancelledRideId: string;
    organizationId: string;
    amount: string;
    currency: Currency;
  },
  collectingOrganizationId: string,
): Promise<void> {
  const commissionRate = normalizeRate((await policyFor(tx, fee.organizationId)).commissionRate);
  const sameLine = collectingOrganizationId === fee.organizationId;
  const common = {
    taxiRideId: fee.cancelledRideId,
    kind: 'ride_cancellation_fee' as const,
    seats: 0,
    currency: fee.currency,
    gross: fee.amount,
  };
  const values = [
    {
      ...common,
      organizationId: fee.organizationId,
      collectedBy: sameLine ? ('operator' as const) : ('platform' as const),
      commissionRate,
      ...splitFare(fee.amount, commissionRate),
    },
    ...(sameLine
      ? []
      : [
          {
            ...common,
            organizationId: collectingOrganizationId,
            collectedBy: 'operator' as const,
            commissionRate: '0.00',
            commission: '0.00',
            earned: '0.00',
          },
        ]),
  ];
  await tx
    .insert(settlementEntries)
    .values(values)
    .onConflictDoNothing({
      target: [
        settlementEntries.taxiRideId,
        settlementEntries.kind,
        settlementEntries.organizationId,
      ],
    });
}
