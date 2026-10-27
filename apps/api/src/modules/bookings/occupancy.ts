import { and, count, eq, gt, inArray, or, sql, type SQL } from 'drizzle-orm';
import type { Database, Transaction } from '../../database/database.service.js';
import { bookingPassengers, bookings, trips } from './bookings.schema.js';

/** A seat counts as taken while its booking is confirmed or its hold has not run out. */
export const occupiesSeat = (): SQL =>
  or(
    eq(bookings.status, 'confirmed'),
    and(eq(bookings.status, 'held'), gt(bookings.expiresAt, sql`now()`)),
  )!;

/** Taken seats per `scheduleId:serviceDate`, for the schedules given. */
export async function takenSeatCounts(
  db: Database,
  scheduleIds: string[],
): Promise<Map<string, number>> {
  if (!scheduleIds.length) return new Map();
  const rows = await db
    .select({ scheduleId: trips.scheduleId, serviceDate: trips.serviceDate, taken: count() })
    .from(trips)
    .innerJoin(
      bookingPassengers,
      and(eq(bookingPassengers.tripId, trips.id), eq(bookingPassengers.active, true)),
    )
    .innerJoin(bookings, and(eq(bookings.id, bookingPassengers.bookingId), occupiesSeat()))
    .where(inArray(trips.scheduleId, [...new Set(scheduleIds)]))
    .groupBy(trips.scheduleId, trips.serviceDate);
  return new Map(rows.map((r) => [`${r.scheduleId}:${r.serviceDate}`, r.taken]));
}

/** Releases the seats of holds that ran out (all trips, or one). Called before taking seats. */
export async function expireHolds(db: Database | Transaction, tripId?: string): Promise<void> {
  const expired = await db
    .update(bookings)
    .set({ status: 'expired' })
    .where(
      and(
        eq(bookings.status, 'held'),
        sql`${bookings.expiresAt} <= now()`,
        tripId ? eq(bookings.tripId, tripId) : undefined,
      ),
    )
    .returning({ id: bookings.id });
  if (expired.length) {
    await db
      .update(bookingPassengers)
      .set({ active: false })
      .where(
        inArray(
          bookingPassengers.bookingId,
          expired.map((b) => b.id),
        ),
      );
  }
}
