import 'server-only';
import { apiErrorText, type Departure, type Locale, type Stop } from '@vtp/shared-types';
import { cacheLife } from 'next/cache';
import { connection } from 'next/server';
import { MESSAGES } from '@/i18n/messages';
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
  locale: Locale,
): Promise<DepartureSearch> {
  const t = MESSAGES[locale].results;
  const query = new URLSearchParams({ from, to, date });
  try {
    return {
      departures: await apiRequest<Departure[]>(`/search/departures?${query}`, { auth: false }),
    };
  } catch (error) {
    if (error instanceof ApiError && error.code === 'VALIDATION_FAILED') {
      return {
        error: from === to ? t.sameStop : t.dateRange,
      };
    }
    if (error instanceof ApiError) {
      return { error: apiErrorText(locale, { code: error.code, message: error.message }) };
    }
    return { error: apiErrorText(locale, { code: 'NETWORK' }) };
  }
}
