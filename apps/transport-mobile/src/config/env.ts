import { normaliseApiBaseUrl } from './parse-env';

/**
 * Public runtime configuration. Expo inlines EXPO_PUBLIC_* values at bundle time,
 * so they must be referenced literally (no dynamic process.env[name] lookups).
 */
export const env = {
  apiBaseUrl: normaliseApiBaseUrl(process.env.EXPO_PUBLIC_API_BASE_URL),
} as const;
