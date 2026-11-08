import type { Service, StopSummary } from './network.js';

/**
 * Which services are on (ADR-029). Switching one off only stops sales: paid tickets and trip
 * packs keep working. The platform admin switches intercity on or off (in general or per city)
 * and each suburban corridor separately; something must always stay on.
 */

/** A city, as stops name it (`Stop.city` + `Stop.state`). */
export interface CityRef {
  city: string;
  state: string;
}

/** A suburban corridor: a named group of catalog stops, curated by platform staff. */
export interface ServiceArea {
  id: string;
  name: string;
  /** Sales are open only while active; a new corridor starts switched off. */
  active: boolean;
  stops: StopSummary[];
}

/** `GET /api/v1/platform/services` (public): what passengers can buy right now. */
export interface ServicesStatus {
  intercity: {
    enabled: boolean;
    /** Cities where intercity departures are not sold (boarding or getting off there). */
    closedCities: CityRef[];
  };
  suburban: {
    /** True while at least one corridor is active. */
    enabled: boolean;
    /** Active corridors only. */
    areas: ServiceArea[];
  };
}

/** `GET /api/v1/admin/services` (platform admin): the same with every corridor. */
export interface ServicesSettings {
  intercity: ServicesStatus['intercity'];
  areas: ServiceArea[];
}

/** `PUT /api/v1/admin/services/intercity` */
export interface IntercitySettingsInput {
  enabled: boolean;
  closedCities: CityRef[];
}

/** `POST /api/v1/admin/service-areas` and `PATCH …/:areaId` (all optional on PATCH). */
export interface ServiceAreaInput {
  name: string;
  stopIds: string[];
  /** Only platform admins switch a corridor on or off. */
  active?: boolean;
}

const sameCity = (a: CityRef, b: CityRef) =>
  a.city.trim().toLowerCase() === b.city.trim().toLowerCase() &&
  a.state.trim().toLowerCase() === b.state.trim().toLowerCase();

/** Whether `city` is in `cities` (case-insensitive). */
export function cityIn(cities: readonly CityRef[], city: CityRef): boolean {
  return cities.some((c) => sameCity(c, city));
}

/** Whether a departure of this service, between these stops, can be sold now. */
export function serviceOpen(
  status: ServicesStatus,
  departure: { service: Service; serviceAreaId: string | null; from: CityRef; to: CityRef },
): boolean {
  if (departure.service === 'suburban') {
    return status.suburban.areas.some((a) => a.id === departure.serviceAreaId);
  }
  return (
    status.intercity.enabled &&
    !cityIn(status.intercity.closedCities, departure.from) &&
    !cityIn(status.intercity.closedCities, departure.to)
  );
}

/** The services passengers can choose between; the UI shows a selector only for two. */
export function openServices(status: ServicesStatus): Service[] {
  return [
    ...(status.intercity.enabled ? (['intercity'] as const) : []),
    ...(status.suburban.enabled ? (['suburban'] as const) : []),
  ];
}
