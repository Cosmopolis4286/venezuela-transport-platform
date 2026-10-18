import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { memoryTokenStore, parseStoredTokens, type TokenStore } from './token-store';

/**
 * Tokens in the iOS Keychain / Android Keystore, readable only while the device is unlocked
 * and never restored onto another device from a backup.
 *
 * The browser preview (`expo start --web`) has no secure storage, so it keeps the session in
 * memory and asks the user to sign in again after a reload. Never persist tokens in localStorage.
 */
export function secureTokenStore(key: string): TokenStore {
  if (Platform.OS === 'web') return memoryTokenStore();
  const options: SecureStore.SecureStoreOptions = {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  };
  return {
    load: async () => parseStoredTokens(await SecureStore.getItemAsync(key, options)),
    save: (tokens) => SecureStore.setItemAsync(key, JSON.stringify(tokens), options),
    clear: () => SecureStore.deleteItemAsync(key, options),
  };
}
