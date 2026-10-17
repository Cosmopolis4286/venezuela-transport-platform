import { parsePublicEnv, type PublicEnv } from './env.schema';

/**
 * Public (browser-visible) configuration. NEXT_PUBLIC_* values must be referenced
 * literally so Next.js can inline them at build time.
 */
export const publicEnv: PublicEnv = parsePublicEnv({
  NEXT_PUBLIC_API_BASE_URL: process.env.NEXT_PUBLIC_API_BASE_URL,
});
