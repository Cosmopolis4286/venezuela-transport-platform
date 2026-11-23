import type { ResponseCache } from '@vtp/mobile-core';
import { File, Paths } from 'expo-file-system';

/** Older answers are deleted: they can hold passengers' names (same as ADR-049). */
const KEEP_MS = 3 * 24 * 3600_000;

type Entries = Record<string, { value: unknown; savedAt: string }>;

let entries: Entries | null = null;
const file = () => new File(Paths.document, 'saved-screens.json');

function load(): Entries {
  if (entries) return entries;
  try {
    const f = file();
    entries = f.exists ? (JSON.parse(f.textSync()) as Entries) : {};
  } catch {
    entries = {};
  }
  const now = Date.now();
  for (const [key, entry] of Object.entries(entries)) {
    if (now - Date.parse(entry.savedAt) > KEEP_MS) delete entries[key];
  }
  return entries;
}

function save(): void {
  try {
    const f = file();
    if (!f.exists) f.create();
    f.write(JSON.stringify(entries ?? {}));
  } catch {
    // Kept in memory; written again with the next answer.
  }
}

/**
 * The last answer of each screen and the signed-in profile, saved on the phone so the app opens
 * and shows them without signal (ADR-051). Deleted on signing out.
 */
export const responseCache: ResponseCache = {
  read: <T>(key: string) => (load()[key] as { value: T; savedAt: string } | undefined) ?? null,
  write: (key, value) => {
    const all = load();
    const same = all[key] && JSON.stringify(all[key].value) === JSON.stringify(value);
    all[key] = { value, savedAt: new Date().toISOString() };
    // Screens that refresh often rarely change: the file is written only when something did.
    if (!same) save();
  },
  clear: () => {
    entries = {};
    try {
      const f = file();
      if (f.exists) f.delete();
    } catch {
      // Nothing to delete.
    }
  },
};
