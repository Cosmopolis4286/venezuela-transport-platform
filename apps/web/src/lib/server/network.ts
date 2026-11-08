import 'server-only';
import {
  apiErrorText,
  openServices,
  SERVICES,
  type Departure,
  type Locale,
  type Service,
  type ServicesStatus,
  type Stop,
} from '@vtp/shared-types';
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

/** Which services are on sale (ADR-029). Public, cached for a few minutes like the stops. */
async function cachedServices(): Promise<ServicesStatus> {
  'use cache';
  cacheLife('minutes');
  return apiRequest<ServicesStatus>('/platform/services', { auth: false });
}

export interface ServiceChoice {
  status: ServicesStatus;
  /** The services passengers can choose; a selector is shown only for two. */
  open: Service[];
  /** The one to show: the requested one if it is open, else the first open one. */
  current: Service;
}

/** The service a page shows, from its `?service=` parameter. */
export async function getServiceChoice(requested: string): Promise<ServiceChoice> {
  await connection();
  const status = await cachedServices();
  const open = openServices(status);
  const wanted = (SERVICES as readonly string[]).includes(requested)
    ? (requested as Service)
    : null;
  return {
    status,
    open,
    current: wanted && open.includes(wanted) ? wanted : (open[0] ?? 'intercity'),
  };
}

export type DepartureSearch =
  { departures: Departure[]; error?: undefined } | { departures?: undefined; error: string };

/** Departures are not cached: schedules change and the date window moves daily. */
export async function searchDepartures(
  from: string,
  to: string,
  date: string,
  locale: Locale,
  service?: Service,
): Promise<DepartureSearch> {
  const t = MESSAGES[locale].results;
  const query = new URLSearchParams({ from, to, date, ...(service ? { service } : {}) });
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
