import type { TripAvailability } from '@vtp/shared-types';
import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';

interface BookingDraft {
  /** The departure being booked, as last loaded on the seat screen. */
  trip: TripAvailability | null;
  seats: string[];
  start: (trip: TripAvailability, seats: string[]) => void;
  clear: () => void;
}

const BookingDraftContext = createContext<BookingDraft | null>(null);

/** Seats chosen on the map, carried to the passenger details screen. */
export function BookingDraftProvider({ children }: { children: ReactNode }) {
  const [trip, setTrip] = useState<TripAvailability | null>(null);
  const [seats, setSeats] = useState<string[]>([]);
  const value = useMemo<BookingDraft>(
    () => ({
      trip,
      seats,
      start: (next, chosen) => {
        setTrip(next);
        setSeats(chosen);
      },
      clear: () => {
        setTrip(null);
        setSeats([]);
      },
    }),
    [trip, seats],
  );
  return <BookingDraftContext.Provider value={value}>{children}</BookingDraftContext.Provider>;
}

export function useBookingDraft(): BookingDraft {
  const value = useContext(BookingDraftContext);
  if (!value) throw new Error('useBookingDraft must be used inside <BookingDraftProvider>');
  return value;
}
