import { DEFAULT_LOCALE, INTL_LOCALES, type Locale } from '../i18n/locales.js';
import { SHARED_MESSAGES } from '../i18n/shared-messages.js';
import type { Organization, OrganizationType } from './organizations.js';

/**
 * The transport network: stops (terminals and roadside stops) curated by the platform, and the
 * routes, fares and recurring schedules each bus company or taxi line publishes on top of them.
 * All local times are Venezuelan time (America/Caracas, UTC-4, no daylight saving).
 */
export const NETWORK_TIME_ZONE = 'America/Caracas';
export const NETWORK_UTC_OFFSET = '-04:00';

/** Organization types that publish routes. Terminals host them but do not run them. */
export const ROUTE_OPERATOR_TYPES = [
  'bus_company',
  'taxi_line',
  'moto_line',
] as const satisfies readonly OrganizationType[];

export function runsRoutes(type: OrganizationType): boolean {
  return (ROUTE_OPERATOR_TYPES as readonly OrganizationType[]).includes(type);
}

// --- Services (ADR-029) -----------------------------------------------------------------------

/**
 * `intercity`: between cities (buses, shared cars, terminal taxis). `suburban`: short, frequent
 * trips inside a corridor (`ServiceArea`). The operator chooses it when creating a route.
 */
export const SERVICES = ['intercity', 'suburban'] as const;
export type Service = (typeof SERVICES)[number];

export const SERVICE_LABELS: Record<Service, string> = SHARED_MESSAGES.es.service;

/** Services each organization type publishes routes in; the first is the default. */
export const SERVICES_BY_ORGANIZATION_TYPE: Record<OrganizationType, readonly Service[]> = {
  bus_company: ['intercity', 'suburban'],
  taxi_line: ['intercity', 'suburban'],
  // Motorcycle taxis only run short trips inside a corridor (ADR-028).
  moto_line: ['suburban'],
  terminal: [],
};

export function servicesFor(type: OrganizationType): readonly Service[] {
  return SERVICES_BY_ORGANIZATION_TYPE[type];
}

// --- Transport modes -------------------------------------------------------------------------

/**
 * The kind of vehicle a route runs and a vehicle is (ADR-028). Each route has one mode, so each
 * mode has its own fares for the same pair of stops.
 */
export const TRANSPORT_MODES = ['bus', 'car', 'motorcycle'] as const;
export type TransportMode = (typeof TRANSPORT_MODES)[number];

export const TRANSPORT_MODE_LABELS: Record<TransportMode, string> =
  SHARED_MESSAGES.es.transportMode;

/** Modes each organization type runs; the first is the default for new routes and vehicles. */
export const TRANSPORT_MODES_BY_ORGANIZATION_TYPE: Record<
  OrganizationType,
  readonly TransportMode[]
> = {
  bus_company: ['bus'],
  taxi_line: ['car'],
  moto_line: ['motorcycle'],
  terminal: [],
};

export function modesFor(type: OrganizationType): readonly TransportMode[] {
  return TRANSPORT_MODES_BY_ORGANIZATION_TYPE[type];
}

/**
 * A motorcycle carries one passenger (decided by the product owner): its departures have one
 * seat and no seat map, and its vehicles have no seat map either.
 */
export const MOTORCYCLE_SEATS = 1;

// --- Stops -------------------------------------------------------------------------------------

export const STOP_KINDS = ['terminal', 'stop'] as const;
export type StopKind = (typeof STOP_KINDS)[number];

export const STOP_KIND_LABELS: Record<StopKind, string> = SHARED_MESSAGES.es.stopKind;

export interface Stop {
  id: string;
  kind: StopKind;
  name: string;
  city: string;
  state: string;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  /** Terminal organization that operates this stop, if it is on the platform. */
  operatorOrganizationId: string | null;
  /** Inactive stops are hidden from search and cannot be added to routes. */
  active: boolean;
}

/** `POST /api/v1/admin/stops` and `PATCH /api/v1/admin/stops/:stopId` (all optional on PATCH). */
export interface StopInput {
  kind: StopKind;
  name: string;
  city: string;
  state: string;
  address?: string | null;
  /** Both or neither. WGS 84. */
  latitude?: number | null;
  longitude?: number | null;
  operatorOrganizationId?: string | null;
  active?: boolean;
}

/** Compact stop shown inside routes and departures. */
export type StopSummary = Pick<Stop, 'id' | 'kind' | 'name' | 'city' | 'state'>;

// --- Routes ------------------------------------------------------------------------------------

/**
 * `draft` → being prepared, invisible to passengers. `active` → its schedules appear in search.
 * `inactive` → withdrawn. Only active organizations can activate routes.
 */
export const ROUTE_STATUSES = ['draft', 'active', 'inactive'] as const;
export type RouteStatus = (typeof ROUTE_STATUSES)[number];

export const ROUTE_STATUS_LABELS: Record<RouteStatus, string> = {
  draft: 'Borrador',
  active: 'Activa',
  inactive: 'Inactiva',
};

export interface RouteStop {
  stop: StopSummary;
  /** 0 for the origin, then strictly increasing. */
  sequence: number;
  /** Travel time from the origin to this stop. 0 for the origin. */
  minutesFromOrigin: number;
}

export const CURRENCIES = ['USD', 'VES'] as const;
export type Currency = (typeof CURRENCIES)[number];

/** Price to travel from one stop of a route to a later one. */
export interface Fare {
  fromStopId: string;
  toStopId: string;
  /** Decimal with two places, e.g. `"25.00"`. */
  amount: string;
  currency: Currency;
}

export const SERVICE_CLASSES = ['standard', 'executive', 'sleeper'] as const;
export type ServiceClass = (typeof SERVICE_CLASSES)[number];

export const SERVICE_CLASS_LABELS: Record<ServiceClass, string> = SHARED_MESSAGES.es.serviceClass;

/** 0 = domingo … 6 = sábado (same as `Date#getUTCDay`). */
export const DAY_OF_WEEK_LABELS = [
  'Domingo',
  'Lunes',
  'Martes',
  'Miércoles',
  'Jueves',
  'Viernes',
  'Sábado',
] as const;

/** A recurring departure from the route's origin. */
export interface Schedule {
  id: string;
  /** Local time at the origin, `HH:MM`. */
  departureTime: string;
  /** Sorted, unique, 0–6. */
  daysOfWeek: number[];
  /** ISO dates (YYYY-MM-DD), inclusive. */
  validFrom: string;
  validUntil: string | null;
  serviceClass: ServiceClass;
  seats: number;
  /** Seat map passengers choose from; `seats` then equals its capacity. */
  seatLayoutId: string | null;
  active: boolean;
  /** Set when it was created as part of a frequency series (`ScheduleSeriesInput`). */
  seriesId: string | null;
}

/** `POST …/routes/:routeId/schedules` and `PATCH …/schedules/:scheduleId` (all optional on PATCH). */
export interface ScheduleInput {
  departureTime: string;
  daysOfWeek: number[];
  validFrom: string;
  validUntil?: string | null;
  serviceClass: ServiceClass;
  /** Required without a seat layout; with one, the layout's capacity is used. */
  seats?: number;
  seatLayoutId?: string | null;
  active?: boolean;
}

/**
 * `POST …/routes/:routeId/schedule-series`: frequent departures, e.g. from 05:00 to 20:00 every
 * 15 minutes. Each departure becomes its own schedule (so trips, bookings and dispatch work as
 * for any other), grouped by `seriesId` to pause or delete them together.
 */
export interface ScheduleSeriesInput extends Omit<ScheduleInput, 'departureTime' | 'active'> {
  /** `HH:MM`, the first departure. */
  firstDeparture: string;
  /** `HH:MM`, the last departure is at or before this time, the same day. */
  lastDeparture: string;
  everyMinutes: number;
}

/** `PATCH …/schedule-series/:seriesId` */
export interface ScheduleSeriesUpdate {
  active: boolean;
}

export const SCHEDULE_SERIES_LIMITS = {
  minEveryMinutes: 5,
  maxEveryMinutes: 240,
  maxDepartures: 150,
} as const;

/** The departure times of a series: `["05:00", "05:15", …]` (empty if `last` is before `first`). */
export function seriesTimes(first: string, last: string, everyMinutes: number): string[] {
  const minutes = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
  const times: string[] = [];
  if (everyMinutes <= 0) return times;
  for (let m = minutes(first); m <= minutes(last); m += everyMinutes) {
    times.push(`${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`);
  }
  return times;
}

export interface Route {
  id: string;
  organizationId: string;
  name: string;
  /** Set when the route is created; never changes. */
  mode: TransportMode;
  /** Set when the route is created; never changes. */
  service: Service;
  /** Corridor of a suburban route (every stop belongs to it); null for intercity routes. */
  serviceAreaId: string | null;
  status: RouteStatus;
  stops: RouteStop[];
  fares: Fare[];
  schedules: Schedule[];
  createdAt: string;
}

/** What `GET /organizations/:id/routes` lists. */
export interface RouteSummary {
  id: string;
  name: string;
  mode: TransportMode;
  service: Service;
  status: RouteStatus;
  origin: StopSummary;
  destination: StopSummary;
  stopCount: number;
  scheduleCount: number;
}

/**
 * `POST /organizations/:organizationId/routes` and `PATCH …/routes/:routeId`.
 * `stops` is the full ordered list; replacing it drops fares whose stops left the route or
 * changed order.
 */
export interface RouteInput {
  name: string;
  stops: { stopId: string; minutesFromOrigin: number }[];
  /** Only on creation; defaults to the organization's first mode (`modesFor`). */
  mode?: TransportMode;
  /** Only on creation; defaults to `intercity`. */
  service?: Service;
  /** Required for suburban routes, on creation: every stop must belong to that corridor. */
  serviceAreaId?: string | null;
}

/** `PUT …/routes/:routeId/fares` replaces every fare of the route. */
export interface ReplaceFaresRequest {
  fares: Fare[];
}

/** `POST …/routes/:routeId/status` */
export interface ChangeRouteStatusRequest {
  status: RouteStatus;
}

// --- Search ------------------------------------------------------------------------------------

/**
 * `GET /api/v1/search/departures?from=<stopId>&to=<stopId>&date=YYYY-MM-DD[&mode=bus][&service=]`
 * (public). Without `mode` or `service`, all of them. Departures of a service that is switched off
 * (`ServicesStatus`) are never listed.
 */
export interface Departure {
  scheduleId: string;
  mode: TransportMode;
  service: Service;
  serviceAreaId: string | null;
  /** Date the bus leaves the route's origin (may be the day before `departsAt` at an intermediate stop). */
  serviceDate: string;
  operator: Pick<Organization, 'id' | 'type' | 'legalName' | 'tradeName'>;
  route: { id: string; name: string };
  from: StopSummary;
  to: StopSummary;
  /** ISO-8601 with the Venezuelan offset, e.g. `2026-10-20T08:30:00-04:00`. */
  departsAt: string;
  arrivesAt: string;
  durationMinutes: number;
  serviceClass: ServiceClass;
  seats: number;
  /** Seats not held or sold on this departure. */
  seatsAvailable: number;
  /** Null when the operator has not priced this pair of stops. */
  fare: Pick<Fare, 'amount' | 'currency'> | null;
}

/** `HH:MM` on a 24-hour clock. */
export function isTimeOfDay(value: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

/** `"8 h 30 min"` style durations for listings. */
export function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (!hours) return `${rest} min`;
  return rest ? `${hours} h ${rest} min` : `${hours} h`;
}

// --- Display helpers (web and mobile) -------------------------------------------------------

/** `NETWORK_UTC_OFFSET` in milliseconds; the only place it is turned into a number. */
const NETWORK_OFFSET_MS = (() => {
  const [, sign, hours, minutes] = /^([+-])(\d{2}):(\d{2})$/.exec(NETWORK_UTC_OFFSET)!;
  return (sign === '-' ? -1 : 1) * (Number(hours) * 60 + Number(minutes)) * 60_000;
})();

/** An instant as a Venezuelan ISO timestamp: `2026-10-20T21:30:00-04:00`. */
export function toNetworkIso(instant: Date | string | number): string {
  const ms = new Date(instant).getTime() + NETWORK_OFFSET_MS;
  return `${new Date(ms).toISOString().slice(0, 19)}${NETWORK_UTC_OFFSET}`;
}

/** `HH:MM` in Venezuela for an instant, e.g. a UTC `boardedAt` from the API. */
export function networkClock(instant: Date | string | number): string {
  return toNetworkIso(instant).slice(11, 16);
}

/** Today's date in Venezuela (UTC−4, no daylight saving), `YYYY-MM-DD`. */
export function todayInVenezuela(now = new Date()): string {
  return toNetworkIso(now).slice(0, 10);
}

/** `HH:MM` of a local ISO timestamp such as `2026-10-20T21:30:00-04:00`. */
export function localTime(iso: string): string {
  return iso.slice(11, 16);
}

/** Calendar days between two local ISO dates/timestamps (by their date part). */
export function daysBetween(fromIso: string, toIso: string): number {
  const day = (iso: string) => Date.parse(`${iso.slice(0, 10)}T00:00:00Z`);
  return Math.round((day(toIso) - day(fromIso)) / 86_400_000);
}

/** "martes, 20 de octubre" / "Tuesday, October 20" / "terça-feira, 20 de outubro" */
export function longDate(isoDate: string, locale: Locale = DEFAULT_LOCALE): string {
  return new Intl.DateTimeFormat(INTL_LOCALES[locale], {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  }).format(new Date(`${isoDate.slice(0, 10)}T12:00:00Z`));
}

/** "US$ 35,00" / "Bs. 600,00" (Spanish); "US$ 35.00" (English) */
export function formatMoney(
  amount: string,
  currency: Currency,
  locale: Locale = DEFAULT_LOCALE,
): string {
  const value = new Intl.NumberFormat(INTL_LOCALES[locale], {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(amount));
  return currency === 'USD' ? `US$ ${value}` : `Bs. ${value}`;
}
