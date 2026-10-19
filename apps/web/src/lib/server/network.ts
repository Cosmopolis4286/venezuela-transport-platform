import 'server-only';
import type { Departure, Stop } from '@vtp/shared-types';
import { cacheLife } from 'next/cache';
import { connection } from 'next/server';
import { ApiError, apiRequest } from './api';

/**
 * Active stops for the search form. Public data, cached for a few minutes across requests.
 * Callers must be request-time (after `connection()`), so builds never call the API.
 */
async function cachedStops(): Promise<Stop[]> {
  'use cache';
  cacheLife('minutes');
  return apiRequest<Stop[]>('/stops', { auth: false });
}

export async function getStops(): Promise<Stop[]> {
  await connection();
  return cachedStops();
}

export type DepartureSearch =
  { departures: Departure[]; error?: undefined } | { departures?: undefined; error: string };

/** Departures are not cached: schedules change and the date window moves daily. */
export async function searchDepartures(
  from: string,
  to: string,
  date: string,
): Promise<DepartureSearch> {
  const query = new URLSearchParams({ from, to, date });
  try {
    return {
      departures: await apiRequest<Departure[]>(`/search/departures?${query}`, { auth: false }),
    };
  } catch (error) {
    if (error instanceof ApiError && error.code === 'VALIDATION_FAILED') {
      return {
        error:
          from === to
            ? 'Elige un destino distinto del origen.'
            : 'Elige una fecha entre hoy y los próximos 180 días.',
      };
    }
    if (error instanceof ApiError) return { error: error.userMessage };
    return { error: 'No pudimos conectar con el servidor. Inténtalo de nuevo.' };
  }
}
