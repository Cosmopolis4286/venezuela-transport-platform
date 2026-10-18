import 'server-only';
import { publicEnv } from '../env';

/**
 * Server-side API base URL. Defaults to the public one; set API_INTERNAL_BASE_URL when the web
 * server reaches the API through a private address (e.g. `http://api:4000/api/v1` in Docker).
 */
export const apiBaseUrl = (
  process.env.API_INTERNAL_BASE_URL || publicEnv.NEXT_PUBLIC_API_BASE_URL
).replace(/\/+$/, '');

export const isProduction = process.env.NODE_ENV === 'production';
