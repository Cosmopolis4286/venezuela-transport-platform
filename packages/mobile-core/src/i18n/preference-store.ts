import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

/**
 * A small non-secret preference (the chosen language) on the device. Native apps use the same
 * key-value store as the session; the browser preview uses localStorage, which is fine for a
 * preference (tokens never go there).
 */
export interface PreferenceStore {
  load(): Promise<string | null>;
  save(value: string | null): Promise<void>;
}

export function devicePreference(key: string): PreferenceStore {
  if (Platform.OS === 'web') {
    return {
      load: async () => {
        try {
          return globalThis.localStorage?.getItem(key) ?? null;
        } catch {
          return null;
        }
      },
      save: async (value) => {
        try {
          if (value === null) globalThis.localStorage?.removeItem(key);
          else globalThis.localStorage?.setItem(key, value);
        } catch {
          // Private mode or storage disabled: the choice lasts until the page reloads.
        }
      },
    };
  }
  return {
    load: () => SecureStore.getItemAsync(key),
    save: (value) =>
      value === null ? SecureStore.deleteItemAsync(key) : SecureStore.setItemAsync(key, value),
  };
}
