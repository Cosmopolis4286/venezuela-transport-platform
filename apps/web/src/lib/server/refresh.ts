import type { AuthResponse } from '@vtp/shared-types';

/**
 * The API revokes a session when a refresh token is used twice (replay protection). Browsers send
 * several requests at once (prefetching, parallel navigations), so refreshes are de-duplicated per
 * refresh token: concurrent callers share one call, and callers that arrive shortly afterwards
 * with the now-rotated token get the same result instead of triggering a replay.
 *
 * In-process only: correct for a single web server instance. Use a shared store (Redis) before
 * running several instances.
 */
const RECENT_MS = 30_000;

type Refresher = (refreshToken: string) => Promise<AuthResponse | null>;

const inFlight = new Map<string, { promise: Promise<AuthResponse | null>; settledAt?: number }>();

export function createDedupedRefresh(refresh: Refresher, now: () => number = Date.now) {
  return async function dedupedRefresh(refreshToken: string): Promise<AuthResponse | null> {
    for (const [token, entry] of inFlight) {
      if (entry.settledAt !== undefined && now() - entry.settledAt > RECENT_MS)
        inFlight.delete(token);
    }
    const existing = inFlight.get(refreshToken);
    if (existing) return existing.promise;

    const entry: { promise: Promise<AuthResponse | null>; settledAt?: number } = {
      promise: refresh(refreshToken).finally(() => {
        entry.settledAt = now();
      }),
    };
    inFlight.set(refreshToken, entry);
    return entry.promise;
  };
}

/** For tests. */
export function resetRefreshCache(): void {
  inFlight.clear();
}
