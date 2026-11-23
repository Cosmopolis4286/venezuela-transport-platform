/**
 * Where an app keeps the last answer of each screen to show it without signal (ADR-051). The
 * transport app saves it to a file; apps that pass none simply need signal.
 */
export interface ResponseCache {
  /** The saved answer for `key` and when it was saved, or null. */
  read<T>(key: string): { value: T; savedAt: string } | null;
  write(key: string, value: unknown): void;
  /** Deletes everything: on signing out, or when another account signs in. */
  clear(): void;
}

/** Keeps answers in memory only: for tests. */
export function memoryResponseCache(now = () => new Date()): ResponseCache {
  const entries = new Map<string, { value: unknown; savedAt: string }>();
  return {
    read: <T>(key: string) =>
      (entries.get(key) as { value: T; savedAt: string } | undefined) ?? null,
    write: (key, value) => {
      entries.set(key, { value, savedAt: now().toISOString() });
    },
    clear: () => entries.clear(),
  };
}

/** The key of the signed-in user's profile, used to open the app without signal. */
export const PROFILE_KEY = 'me';
/** The key of a GET answer. */
export const responseKey = (path: string) => `api:${path}`;
