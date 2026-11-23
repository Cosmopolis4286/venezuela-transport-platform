import type { ApiClient } from '@vtp/mobile-core';
import type { Booking } from '@vtp/shared-types';
import { File, Paths } from 'expo-file-system';
import { useEffect, useSyncExternalStore } from 'react';
import { AppState } from 'react-native';
import {
  NO_SAVED_TICKETS,
  withBooking,
  withList,
  withoutEnded,
  type SavedTickets,
} from './saved-tickets';

// One copy in memory, shared by every screen, saved to a file so it is there without signal.
let cache: SavedTickets | null = null;
const listeners = new Set<() => void>();
let syncing: Promise<void> | null = null;

const file = () => new File(Paths.document, 'saved-tickets.json');

function read(): SavedTickets {
  if (cache) return cache;
  let saved = NO_SAVED_TICKETS;
  try {
    const f = file();
    if (f.exists) saved = JSON.parse(f.textSync()) as SavedTickets;
  } catch {
    saved = NO_SAVED_TICKETS;
  }
  // Trips that ended two days ago go away, also from the file.
  cache = withoutEnded(saved, Date.now());
  if (cache !== saved) persist(cache);
  return cache;
}

function write(next: SavedTickets): void {
  cache = next;
  listeners.forEach((notify) => notify());
  persist(next);
}

function persist(next: SavedTickets): void {
  try {
    const f = file();
    if (!next.bookings.length && !next.userId) {
      if (f.exists) f.delete();
      return;
    }
    if (!f.exists) f.create();
    f.write(JSON.stringify(next));
  } catch {
    // Kept in memory; written again with the next change.
  }
}

/** The paid tickets kept on this phone, updated as they change. */
export function useSavedTickets(): SavedTickets {
  return useSyncExternalStore((notify) => {
    listeners.add(notify);
    return () => listeners.delete(notify);
  }, read);
}

/** Keeps a booking just loaded with signal (or drops it if it is no longer paid). */
export function saveBooking(userId: string, booking: Booking): void {
  write(withBooking(read(), userId, booking, Date.now()));
}

/** Keeps the account's list just loaded with signal. */
export function saveBookings(userId: string, bookings: Booking[]): void {
  write(withList(userId, bookings, Date.now()));
}

/** Deletes the saved tickets: on signing out or deleting the account. */
export function clearSavedTickets(): void {
  write(NO_SAVED_TICKETS);
}

/** Downloads the account's bookings and keeps the paid ones. Throws without signal. */
function syncSaved(api: ApiClient, userId: string): Promise<void> {
  syncing ??= api
    .request<Booking[]>('/me/bookings')
    .then((bookings) => saveBookings(userId, bookings))
    .finally(() => {
      syncing = null;
    });
  return syncing;
}

/**
 * While signed in, keeps the paid tickets on the phone: on start and each time the app comes back
 * to front. Without signal it simply tries again the next time.
 */
export function useKeepTicketsSaved(api: ApiClient, userId: string | null): void {
  useEffect(() => {
    if (!userId) return;
    const run = () => void syncSaved(api, userId).catch(() => undefined);
    run();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') run();
    });
    return () => subscription.remove();
  }, [api, userId]);
}
