import type { Booking } from '@vtp/shared-types';

/** A ticket is kept this long after its trip ends, then deleted: it has the passengers' data. */
export const KEEP_AFTER_TRIP_MS = 2 * 24 * 3600_000;

/** What the phone keeps of a paid booking to show its QR codes without signal. */
export interface SavedBooking {
  id: string;
  code: string;
  departsAt: string;
  arrivesAt: string;
  /** Open ticket (frequency service): numbered for the day, not tied to a seat. */
  open: boolean;
  operator: string;
  from: string;
  to: string;
  passengers: {
    seatNumber: string;
    name: string;
    document: string;
    qr: string;
    boardedAt: string | null;
  }[];
}

export interface SavedTickets {
  /** The account they belong to; another account replaces them. */
  userId: string | null;
  /** When they were last downloaded. */
  savedAt: string | null;
  bookings: SavedBooking[];
}

export const NO_SAVED_TICKETS: SavedTickets = { userId: null, savedAt: null, bookings: [] };

const ended = (booking: { arrivesAt: string }, now: number) =>
  Date.parse(booking.arrivesAt) + KEEP_AFTER_TRIP_MS <= now;

/** The paid bookings worth keeping: confirmed, not cancelled, trip not long over. */
export function toSaved(bookings: Booking[], now: number): SavedBooking[] {
  return bookings
    .filter(
      (b) =>
        b.status === 'confirmed' &&
        !b.trip.cancellation &&
        !ended(b.trip, now) &&
        b.passengers.some((p) => p.ticket),
    )
    .map((b) => ({
      id: b.id,
      code: b.code,
      departsAt: b.trip.departsAt,
      arrivesAt: b.trip.arrivesAt,
      open: b.trip.headwayMinutes !== null,
      operator: b.operator.tradeName ?? b.operator.legalName,
      from: b.from.city,
      to: b.to.city,
      passengers: b.passengers.flatMap((p) =>
        p.ticket
          ? [
              {
                seatNumber: p.seatNumber,
                name: `${p.firstName} ${p.lastName}`,
                document: `${p.documentType}-${p.documentNumber}`,
                qr: p.ticket.qr,
                boardedAt: p.ticket.boardedAt,
              },
            ]
          : [],
      ),
    }))
    .sort((a, b) => Date.parse(a.departsAt) - Date.parse(b.departsAt));
}

/** Replaces what is kept with the account's latest list. */
export function withList(userId: string, bookings: Booking[], now: number): SavedTickets {
  return { userId, savedAt: new Date(now).toISOString(), bookings: toSaved(bookings, now) };
}

/**
 * Updates one booking just opened with signal: kept if still worth it, dropped otherwise (e.g.
 * cancelled). Ignored when the phone keeps another account's tickets.
 */
export function withBooking(
  saved: SavedTickets,
  userId: string,
  booking: Booking,
  now: number,
): SavedTickets {
  if (saved.userId !== null && saved.userId !== userId) return saved;
  const others = saved.bookings.filter((b) => b.id !== booking.id);
  return {
    userId,
    savedAt: saved.savedAt,
    bookings: [...others, ...toSaved([booking], now)].sort(
      (a, b) => Date.parse(a.departsAt) - Date.parse(b.departsAt),
    ),
  };
}

/** Drops the trips that ended more than two days ago. */
export function withoutEnded(saved: SavedTickets, now: number): SavedTickets {
  const bookings = saved.bookings.filter((b) => !ended(b, now));
  return bookings.length === saved.bookings.length ? saved : { ...saved, bookings };
}
