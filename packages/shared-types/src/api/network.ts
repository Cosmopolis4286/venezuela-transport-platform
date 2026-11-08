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
] as const satisfies readonly OrganizationType[];

export function runsRoutes(type: OrganizationType): boolean {
  return (ROUTE_OPERATOR_TYPES as readonly OrganizationType[]).includes(type);
}

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
  /** Operating zone (city or region) the stop belongs to; null = not assigned yet. */
  zoneId: string | null;
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
  /** Omitted on create: assigned to the zone whose area contains the location, if any. */
  zoneId?: string | null;
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
 * `interurban`: between cities (bus terminals). `suburban`: urban and suburban service (buses,
 * por puesto). Decides who is paid by default (ADR-030).
 */
export const ROUTE_SCOPES = ['interurban', 'suburban'] as const;
export type RouteScope = (typeof ROUTE_SCOPES)[number];

export const ROUTE_SCOPE_LABELS: Record<RouteScope, string> = {
  interurban: 'Interurbana',
  suburban: 'Urbana o suburbana',
};

/** Who receives the fares of a route: the line/company, or the driver of each trip (ADR-030). */
export const PAYEES = ['organization', 'driver'] as const;
export type Payee = (typeof PAYEES)[number];

export const PAYEE_LABELS: Record<Payee, string> = {
  organization: 'La empresa o línea',
  driver: 'El conductor de cada viaje',
};

/** Interurban routes pay the line; suburban ones the driver, unless the route says otherwise. */
export function defaultPayee(scope: RouteScope): Payee {
  return scope === 'suburban' ? 'driver' : 'organization';
}

export interface Route {
  id: string;
  organizationId: string;
  name: string;
  status: RouteStatus;
  scope: RouteScope;
  /** The route's own choice; null uses `defaultPayee(scope)`. */
  payeeOverride: Payee | null;
  /** Who is paid for this route's sales. */
  payee: Payee;
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
  /** Default `interurban`. */
  scope?: RouteScope;
  /** Null (or omitted) uses the default for the scope. */
  payeeOverride?: Payee | null;
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
  /** Seats not held or sold on this departure. */
  seatsAvailable: number;
  /** Null when the operator has not priced this pair of stops. */
  fare: Pick<Fare, 'amount' | 'currency'> | null;
  /** Platform service fee (percentage, e.g. "15.00") charged on top of the fare (ADR-029). */
  serviceFeeRate: string;
}

/**
 * The service fee on `fares` at `rate` percent and the total the passenger pays, rounded half up
 * to cents exactly as the API does (ADR-029). For showing prices; the API's booking is the truth.
 */
export function withServiceFee(fares: string, rate: string): { fee: string; total: string } {
  const scaled = (value: string) => {
    const [whole = '0', fraction = ''] = value.split('.');
    return BigInt(whole) * 100n + BigInt((fraction + '00').slice(0, 2));
  };
  const cents = scaled(fares);
  const product = cents * scaled(rate);
  const fee = (product * 2n + 10_000n) / 20_000n;
  const show = (value: bigint) => `${value / 100n}.${(value % 100n).toString().padStart(2, '0')}`;
  return { fee: show(fee), total: show(cents + fee) };
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

// --- Operating zones -------------------------------------------------------------------------

/**
 * `active`: sells trips and taxis. `coming_soon`: listed so passengers know it is coming, but
 * nothing in it can be booked. `paused`: hidden (e.g. a strike or a regulatory stop).
 */
export const ZONE_STATUSES = ['active', 'coming_soon', 'paused'] as const;
export type ZoneStatus = (typeof ZONE_STATUSES)[number];

export const ZONE_STATUS_LABELS: Record<ZoneStatus, string> = {
  active: 'Activa',
  coming_soon: 'Próximamente',
  paused: 'Pausada',
};

/**
 * A city or region the platform operates in (e.g. «Eje Casacoima – San Félix», «Maturín»).
 * Stops belong to a zone; a route's zone is the zone of its first stop. One database for all.
 */
export interface OperatingZone {
  id: string;
  name: string;
  /** Lower-case, for URLs: `san-felix`. */
  slug: string;
  status: ZoneStatus;
  /** Suggested currency for new fares in this zone. */
  defaultCurrency: Currency;
  /**
   * Platform commission (percentage, e.g. "15.00") for trips that start in this zone; null uses
   * the platform rate. A company's own override still wins.
   */
  commissionRate: string | null;
  /** Centre and radius of the area; new stops inside it are assigned to the zone. */
  latitude: number | null;
  longitude: number | null;
  radiusKm: number | null;
  /** Stops assigned to the zone (admin listing only). */
  stopCount?: number;
}

/** `POST /api/v1/admin/zones` and `PATCH /api/v1/admin/zones/:zoneId` (all optional on PATCH). */
export interface OperatingZoneInput {
  name: string;
  slug: string;
  status?: ZoneStatus;
  defaultCurrency?: Currency;
  commissionRate?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  radiusKm?: number | null;
}

/** `GET /api/v1/stops/nearby?latitude=&longitude=&radiusKm=`: stops of active zones, nearest first. */
export interface NearbyStop extends Stop {
  distanceKm: number;
}
