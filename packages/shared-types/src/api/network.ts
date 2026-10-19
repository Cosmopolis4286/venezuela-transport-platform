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
] as const satisfies readonly OrganizationType[];

export function runsRoutes(type: OrganizationType): boolean {
  return (ROUTE_OPERATOR_TYPES as readonly OrganizationType[]).includes(type);
}

// --- Stops -------------------------------------------------------------------------------------

export const STOP_KINDS = ['terminal', 'stop'] as const;
export type StopKind = (typeof STOP_KINDS)[number];

export const STOP_KIND_LABELS: Record<StopKind, string> = {
  terminal: 'Terminal',
  stop: 'Parada',
};

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

export const SERVICE_CLASS_LABELS: Record<ServiceClass, string> = {
  standard: 'Convencional',
  executive: 'Ejecutivo',
  sleeper: 'Buscama',
};

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
  active: boolean;
}

/** `POST …/routes/:routeId/schedules` and `PATCH …/schedules/:scheduleId` (all optional on PATCH). */
export interface ScheduleInput {
  departureTime: string;
  daysOfWeek: number[];
  validFrom: string;
  validUntil?: string | null;
  serviceClass: ServiceClass;
  seats: number;
  active?: boolean;
}

export interface Route {
  id: string;
  organizationId: string;
  name: string;
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

/** `GET /api/v1/search/departures?from=<stopId>&to=<stopId>&date=YYYY-MM-DD` (public). */
export interface Departure {
  scheduleId: string;
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

/** Today's date in Venezuela (UTC−4, no daylight saving), `YYYY-MM-DD`. */
export function todayInVenezuela(now = new Date()): string {
  return new Date(now.getTime() - 4 * 3600_000).toISOString().slice(0, 10);
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

/** "martes, 20 de octubre" */
export function longDate(isoDate: string): string {
  return new Intl.DateTimeFormat('es-VE', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  }).format(new Date(`${isoDate.slice(0, 10)}T12:00:00Z`));
}

/** "US$ 35,00" / "Bs. 600,00" */
export function formatMoney(amount: string, currency: Currency): string {
  const value = new Intl.NumberFormat('es-VE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(amount));
  return currency === 'USD' ? `US$ ${value}` : `Bs. ${value}`;
}
