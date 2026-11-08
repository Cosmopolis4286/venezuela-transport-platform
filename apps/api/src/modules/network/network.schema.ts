import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  date,
  geometry,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  smallint,
  text,
  time,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import {
  CURRENCIES,
  ROUTE_STATUSES,
  SERVICE_CLASSES,
  SERVICES,
  STOP_KINDS,
  type CityRef,
} from '@vtp/shared-types';
import { timestamps, users } from '../identity/identity.schema.js';
import { seatLayouts, transportMode } from '../fleet/fleet.schema.js';
import { organizations } from '../organizations/organizations.schema.js';

export const stopKind = pgEnum('stop_kind', STOP_KINDS);
export const routeStatus = pgEnum('route_status', ROUTE_STATUSES);
export const currency = pgEnum('currency', CURRENCIES);
export const serviceClass = pgEnum('service_class', SERVICE_CLASSES);
export const routeService = pgEnum('route_service', SERVICES);

/** Terminals and roadside stops. Shared reference data curated by platform staff. */
export const stops = pgTable(
  'stops',
  {
    id: uuid().primaryKey().defaultRandom(),
    kind: stopKind().notNull(),
    name: text().notNull(),
    city: text().notNull(),
    state: text().notNull(),
    address: text(),
    /** WGS 84 point (x = longitude, y = latitude). */
    location: geometry({ type: 'point', mode: 'xy', srid: 4326 }),
    operatorOrganizationId: uuid().references(() => organizations.id, { onDelete: 'set null' }),
    active: boolean().notNull().default(true),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('stops_name_city_key').on(sql`lower(${t.name})`, sql`lower(${t.city})`),
    index('stops_location_idx').using('gist', t.location),
  ],
);

/** A suburban corridor (ADR-029): a named group of stops whose sales open and close together. */
export const serviceAreas = pgTable(
  'service_areas',
  {
    id: uuid().primaryKey().defaultRandom(),
    name: text().notNull(),
    /** New corridors start switched off; only platform admins switch them. */
    active: boolean().notNull().default(false),
    ...timestamps,
  },
  (t) => [uniqueIndex('service_areas_name_key').on(sql`lower(${t.name})`)],
);

export const serviceAreaStops = pgTable(
  'service_area_stops',
  {
    serviceAreaId: uuid()
      .notNull()
      .references(() => serviceAreas.id, { onDelete: 'cascade' }),
    stopId: uuid()
      .notNull()
      .references(() => stops.id, { onDelete: 'restrict' }),
  },
  (t) => [primaryKey({ columns: [t.serviceAreaId, t.stopId] })],
);

/** Intercity on/off switches (ADR-029). A single row (`id = 1`), created on first write. */
export const networkSettings = pgTable(
  'network_settings',
  {
    id: integer().primaryKey().default(1),
    intercityEnabled: boolean().notNull().default(true),
    intercityClosedCities: jsonb().$type<CityRef[]>().notNull().default([]),
    updatedByUserId: uuid().references(() => users.id, { onDelete: 'set null' }),
    ...timestamps,
  },
  (t) => [check('network_settings_single_row', sql`${t.id} = 1`)],
);

/** A line run by a bus company or taxi line: an ordered list of stops. */
export const routes = pgTable(
  'routes',
  {
    id: uuid().primaryKey().defaultRandom(),
    organizationId: uuid()
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    name: text().notNull(),
    /** Bus, car or motorcycle (ADR-028); fixed when the route is created. */
    mode: transportMode().notNull(),
    /** Intercity or suburban (ADR-029); fixed when the route is created. */
    service: routeService().notNull().default('intercity'),
    /** Corridor of a suburban route; null for intercity ones. */
    serviceAreaId: uuid().references(() => serviceAreas.id, { onDelete: 'restrict' }),
    status: routeStatus().notNull().default('draft'),
    createdBy: uuid().references(() => users.id, { onDelete: 'set null' }),
    ...timestamps,
  },
  (t) => [
    index('routes_organization_idx').on(t.organizationId, t.status),
    check(
      'routes_service_area_check',
      sql`(${t.service} = 'suburban') = (${t.serviceAreaId} is not null)`,
    ),
  ],
);

export const routeStops = pgTable(
  'route_stops',
  {
    routeId: uuid()
      .notNull()
      .references(() => routes.id, { onDelete: 'cascade' }),
    stopId: uuid()
      .notNull()
      .references(() => stops.id, { onDelete: 'restrict' }),
    sequence: smallint().notNull(),
    minutesFromOrigin: integer().notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.routeId, t.sequence] }),
    uniqueIndex('route_stops_route_stop_key').on(t.routeId, t.stopId),
    // Search starts from a stop.
    index('route_stops_stop_idx').on(t.stopId),
    check('route_stops_minutes_check', sql`${t.minutesFromOrigin} >= 0`),
  ],
);

/** Price between two stops of a route, in the direction of travel. */
export const routeFares = pgTable(
  'route_fares',
  {
    routeId: uuid()
      .notNull()
      .references(() => routes.id, { onDelete: 'cascade' }),
    fromStopId: uuid()
      .notNull()
      .references(() => stops.id, { onDelete: 'restrict' }),
    toStopId: uuid()
      .notNull()
      .references(() => stops.id, { onDelete: 'restrict' }),
    amount: numeric({ precision: 12, scale: 2 }).notNull(),
    currency: currency().notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.routeId, t.fromStopId, t.toStopId] }),
    check('route_fares_amount_check', sql`${t.amount} > 0`),
  ],
);

/** A recurring departure from the route's origin, in Venezuelan local time. */
export const routeSchedules = pgTable(
  'route_schedules',
  {
    id: uuid().primaryKey().defaultRandom(),
    routeId: uuid()
      .notNull()
      .references(() => routes.id, { onDelete: 'cascade' }),
    departureTime: time().notNull(),
    /** 0 = Sunday … 6 = Saturday. */
    daysOfWeek: smallint().array().notNull(),
    validFrom: date({ mode: 'string' }).notNull(),
    validUntil: date({ mode: 'string' }),
    serviceClass: serviceClass().notNull(),
    seats: integer().notNull(),
    /** When set, `seats` mirrors the layout's capacity. */
    seatLayoutId: uuid().references(() => seatLayouts.id, { onDelete: 'restrict' }),
    active: boolean().notNull().default(true),
    /** Groups the departures of a frequency series (`ScheduleSeriesInput`). */
    seriesId: uuid(),
    ...timestamps,
  },
  (t) => [
    index('route_schedules_route_idx').on(t.routeId),
    index('route_schedules_series_idx').on(t.seriesId),
    check('route_schedules_seats_check', sql`${t.seats} between 1 and 100`),
    check(
      'route_schedules_validity_check',
      sql`${t.validUntil} is null or ${t.validUntil} >= ${t.validFrom}`,
    ),
  ],
);

export type StopRow = typeof stops.$inferSelect;
export type RouteRow = typeof routes.$inferSelect;
export type RouteStopRow = typeof routeStops.$inferSelect;
export type RouteFareRow = typeof routeFares.$inferSelect;
export type RouteScheduleRow = typeof routeSchedules.$inferSelect;
export type ServiceAreaRow = typeof serviceAreas.$inferSelect;
