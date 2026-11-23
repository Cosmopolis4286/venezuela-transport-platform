import { ApiError, userMessage, type ApiClient } from '@vtp/mobile-core';
import { File, Paths } from 'expo-file-system';
import { useEffect, useSyncExternalStore } from 'react';
import { AppState } from 'react-native';
import { noSignal, withTimeout } from './no-signal';
import {
  EMPTY_OUTBOX,
  requestOf,
  withFailed,
  withItem,
  withoutFailed,
  withSent,
  type Outbox,
  type OutboxItem,
} from './outbox';

/** Pending work is sent this often while the app is open (and when it comes back to front). */
const SEND_EVERY_MS = 60_000;

// One copy in memory, shared by every screen, saved to a file to survive restarts.
let cache: Outbox | null = null;
const listeners = new Set<() => void>();
let sending: Promise<void> | null = null;

const file = () => new File(Paths.document, 'outbox.json');

function read(): Outbox {
  if (cache) return cache;
  try {
    const f = file();
    cache = f.exists ? (JSON.parse(f.textSync()) as Outbox) : EMPTY_OUTBOX;
  } catch {
    cache = EMPTY_OUTBOX;
  }
  return cache;
}

function update(change: (outbox: Outbox) => Outbox): void {
  const next = change(read());
  if (next === cache) return;
  cache = next;
  listeners.forEach((notify) => notify());
  try {
    const f = file();
    if (!f.exists) f.create();
    f.write(JSON.stringify(next));
  } catch {
    // Kept in memory; written again with the next change.
  }
}

/** What is waiting to be sent, updated as it changes. */
export function useOutbox(): Outbox {
  return useSyncExternalStore((notify) => {
    listeners.add(notify);
    return () => listeners.delete(notify);
  }, read);
}

/** Saves work done without signal; it goes out as soon as there is signal. */
export function enqueue(api: ApiClient, userId: string, item: OutboxItem): void {
  update((outbox) => withItem(outbox, userId, item));
  void sendPending(api, userId);
}

export function dismissFailed(): void {
  update(withoutFailed);
}

/**
 * Sends the pending work in order. Stops at the first item without signal (tried again later);
 * one the API refuses leaves the queue with its reason.
 */
export function sendPending(api: ApiClient, userId: string): Promise<void> {
  sending ??= (async () => {
    for (;;) {
      const outbox = read();
      const item = outbox.userId === userId ? outbox.pending[0] : undefined;
      if (!item) return;
      const { path, body } = requestOf(item);
      try {
        await withTimeout(api.request(path, { body }));
        update((o) => withSent(o, item.id));
      } catch (e) {
        if (noSignal(e)) return;
        // The step reached the API before (e.g. the answer got lost): nothing left to do.
        if (e instanceof ApiError && e.reason === 'TRIP_WRONG_STEP' && item.kind !== 'cash') {
          update((o) => withSent(o, item.id));
        } else {
          update((o) => withFailed(o, item.id, userMessage(e)));
        }
      }
    }
  })().finally(() => {
    sending = null;
  });
  return sending;
}

/** While signed in, sends pending work every minute and when the app comes back to front. */
export function useSendPending(api: ApiClient, userId: string | null): void {
  useEffect(() => {
    if (!userId) return;
    const run = () => void sendPending(api, userId).catch(() => undefined);
    run();
    const timer = setInterval(run, SEND_EVERY_MS);
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') run();
    });
    return () => {
      clearInterval(timer);
      subscription.remove();
    };
  }, [api, userId]);
}
