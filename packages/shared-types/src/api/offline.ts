/**
 * Work done on a phone without signal and sent later (ADR-049, ADR-051): boardings, cash sales,
 * departures and arrivals carry the time they happened on the phone.
 */

/** How far back such a time is accepted when it finally reaches the API. */
export const OFFLINE_MAX_AGE_MS = 48 * 3600_000;

/**
 * The time to record for something done at `asked` (ISO, from the phone) and received `now`:
 * never in the future, never older than {@link OFFLINE_MAX_AGE_MS}; `now` when missing or invalid.
 */
export function offlineTime(asked: string | undefined | null, now: number): number {
  const at = asked ? Date.parse(asked) : Number.NaN;
  return Number.isNaN(at) ? now : Math.min(now, Math.max(now - OFFLINE_MAX_AGE_MS, at));
}
