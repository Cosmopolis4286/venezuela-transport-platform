import { and, count, eq } from 'drizzle-orm';
import type { Transaction } from '../../database/database.service.js';
import { bookingPassengers, bookings, trips } from '../bookings/bookings.schema.js';
import { fromScaled, toScaled } from '../payments/money.js';
import { organizationCommissions, settlementEntries } from './settlements.schema.js';

/**
 * Commission on `gross` at `rate` percent, rounded half up to cents; the operator earns the rest.
 * Integer arithmetic only: cents × basis points / 10 000.
 */
export function splitFare(gross: string, rate: string): { commission: string; earned: string } {
  const cents = toScaled(gross, 2);
  const basisPoints = toScaled(rate, 2);
  const commission = (cents * basisPoints * 2n + 10_000n) / 20_000n;
  return { commission: fromScaled(commission, 2), earned: fromScaled(cents - commission, 2) };
}

/** `"8.5"` → `"8.50"`. */
export const normalizeRate = (rate: string) => fromScaled(toScaled(rate, 2), 2);

/**
 * Writes what a booking that was just confirmed earns its operator, with the commission in force
 * now. Runs inside the confirming transaction; a second call for the same booking does nothing.
 */
export async function recordEarning(
  tx: Transaction,
  bookingId: string,
  defaultRate: string,
): Promise<void> {
  const [row] = await tx
    .select({
      organizationId: trips.organizationId,
      gross: bookings.totalAmount,
      currency: bookings.currency,
      override: organizationCommissions.rate,
    })
    .from(bookings)
    .innerJoin(trips, eq(trips.id, bookings.tripId))
    .leftJoin(
      organizationCommissions,
      eq(organizationCommissions.organizationId, trips.organizationId),
    )
    .where(eq(bookings.id, bookingId));
  if (!row) throw new Error(`Booking ${bookingId} not found`);
  const [seats] = await tx
    .select({ n: count() })
    .from(bookingPassengers)
    .where(and(eq(bookingPassengers.bookingId, bookingId), eq(bookingPassengers.active, true)));
  const commissionRate = normalizeRate(row.override ?? defaultRate);
  await tx
    .insert(settlementEntries)
    .values({
      organizationId: row.organizationId,
      bookingId,
      seats: seats?.n ?? 0,
      currency: row.currency,
      gross: row.gross,
      commissionRate,
      ...splitFare(row.gross, commissionRate),
    })
    .onConflictDoNothing({ target: settlementEntries.bookingId });
}
