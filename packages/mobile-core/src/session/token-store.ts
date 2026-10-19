import type { AuthTokens } from '@vtp/shared-types';

/** Where the session tokens live. Native apps use the Keychain/Keystore (see secure-token-store). */
export interface TokenStore {
  load(): Promise<AuthTokens | null>;
  save(tokens: AuthTokens): Promise<void>;
  clear(): Promise<void>;
}

/** Keeps tokens in memory only: used in tests and in the browser preview, where nothing persists. */
export function memoryTokenStore(initial: AuthTokens | null = null): TokenStore {
  let tokens = initial;
  return {
    load: async () => tokens,
    save: async (next) => {
      tokens = next;
    },
    clear: async () => {
      tokens = null;
    },
  };
}

export function parseStoredTokens(raw: string | null): AuthTokens | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<AuthTokens>;
    if (
      typeof value.accessToken === 'string' &&
      typeof value.refreshToken === 'string' &&
      typeof value.accessTokenExpiresAt === 'string' &&
      typeof value.refreshTokenExpiresAt === 'string'
    ) {
      return value as AuthTokens;
    }
  } catch {
    // Corrupt entry: treat as signed out.
  }
  return null;
}
