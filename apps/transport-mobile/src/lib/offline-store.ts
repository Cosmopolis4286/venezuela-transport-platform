import type { ApiClient } from '@vtp/mobile-core';
import type { OfflineBoardingOutcome, OfflineTicketList } from '@vtp/shared-types';
import { File, Paths } from 'expo-file-system';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { AppState } from 'react-native';
import { EMPTY_OFFLINE, withList, withoutSent, type OfflineTickets } from './offline-tickets';

/** The list is refreshed this often while the app is open (and when it comes back to front). */
const SYNC_EVERY_MS = 5 * 60_000;
/** A list this old with nothing pending is deleted: it has passengers' names. */
const KEEP_MS = 3 * 24 * 3600_000;

// One copy per line in memory, shared by every screen, saved to a file to survive restarts.
const cache = new Map<string, OfflineTickets>();
const listeners = new Map<string, Set<() => void>>();
const syncing = new Map<string, Promise<void>>();

const fileOf = (organizationId: string) =>
  new File(Paths.document, `offline-tickets-${organizationId}.json`);

function read(organizationId: string): OfflineTickets {
  const cached = cache.get(organizationId);
  if (cached) return cached;
  let saved = EMPTY_OFFLINE;
  try {
    const file = fileOf(organizationId);
    if (file.exists) {
      saved = JSON.parse(file.textSync()) as OfflineTickets;
      const old = saved.list && Date.now() - Date.parse(saved.list.generatedAt) > KEEP_MS;
      if (old && !saved.pending.length) {
        file.delete();
        saved = EMPTY_OFFLINE;
      }
    }
  } catch {
    saved = EMPTY_OFFLINE;
  }
  cache.set(organizationId, saved);
  return saved;
}

/** Changes what the phone keeps for a line, in memory and in its file. */
export function updateOffline(
  organizationId: string,
  change: (saved: OfflineTickets) => OfflineTickets,
): void {
  const next = change(read(organizationId));
  cache.set(organizationId, next);
  listeners.get(organizationId)?.forEach((notify) => notify());
  try {
    const file = fileOf(organizationId);
    if (!file.exists) file.create();
    file.write(JSON.stringify(next));
  } catch {
    // Kept in memory; written again with the next change.
  }
}

/** What the phone keeps for a line, updated as it changes. */
export function useOfflineTickets(organizationId: string): OfflineTickets {
  return useSyncExternalStore(
    (notify) => {
      const set = listeners.get(organizationId) ?? new Set();
      set.add(notify);
      listeners.set(organizationId, set);
      return () => set.delete(notify);
    },
    () => read(organizationId),
  );
}

/**
 * Sends the boardings made without signal, then downloads the line's tickets again. Fails
 * (throws) without signal; what is kept stays as it was.
 */
export function syncOffline(api: ApiClient, organizationId: string): Promise<void> {
  const running = syncing.get(organizationId);
  if (running) return running;
  const base = `/organizations/${encodeURIComponent(organizationId)}/tickets`;
  const work = (async () => {
    const pending = read(organizationId).pending.slice(0, 500);
    if (pending.length) {
      const outcomes = await api.request<OfflineBoardingOutcome[]>(`${base}/offline-boardings`, {
        method: 'POST',
        body: { boardings: pending },
      });
      updateOffline(organizationId, (saved) => withoutSent(saved, outcomes));
    }
    const list = await api.request<OfflineTicketList>(`${base}/offline`);
    updateOffline(organizationId, (saved) => withList(saved, list));
  })().finally(() => syncing.delete(organizationId));
  syncing.set(organizationId, work);
  return work;
}

/**
 * Keeps a line's tickets on the phone while the app is open: on start, every few minutes and
 * when the app comes back to front. Without signal it simply tries again later.
 */
export function useOfflineSync(
  api: ApiClient,
  organizationId: string | null,
): {
  syncing: boolean;
} {
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!organizationId) return;
    let alive = true;
    const run = () => {
      setBusy(true);
      syncOffline(api, organizationId)
        .catch(() => undefined)
        .finally(() => alive && setBusy(false));
    };
    run();
    const timer = setInterval(run, SYNC_EVERY_MS);
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') run();
    });
    return () => {
      alive = false;
      clearInterval(timer);
      subscription.remove();
    };
  }, [api, organizationId]);
  return { syncing: busy };
}
