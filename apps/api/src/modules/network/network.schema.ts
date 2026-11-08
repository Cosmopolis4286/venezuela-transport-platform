import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  date,
  geometry,
  index,
  integer,
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
  STOP_KINDS,
  ZONE_STATUSES,
} from '@vtp/shared-types';
import { timestamps, users } from '../identity/identity.schema.js';
import { seatLayouts } from '../fleet/fleet.schema.js';
import { organizations } from '../organizations/organizations.schema.js';

export const stopKind = pgEnum('stop_kind', STOP_KINDS);
export const routeStatus = pgEnum('route_status', ROUTE_STATUSES);
export const currency = pgEnum('currency', CURRENCIES);
export const serviceClass = pgEnum('service_class', SERVICE_CLASSES);
export const zoneStatus = pgEnum('zone_status', ZONE_STATUSES);

/**
 * Cities or regions the platform operates in (ADR-028). Everything stays in one database; a zone
 * only decides whether its stops sell, their default currency and an optional commission.
 */
export const operatingZones = pgTable(
  'operating_zones',
  {
    id: uuid().primaryKey().defaultRandom(),
    name: text().notNull(),
    slug: text().notNull(),
    status: zoneStatus().notNull().default('coming_soon'),
    defaultCurrency: currency().notNull().default('USD'),
    /** Percentage, e.g. 15.00; null uses the platform rate. */
    commissionRate: numeric({ precision: 5, scale: 2 }),
    /** Centre of the area (WGS 84) and its radius: new stops inside are assigned to the zone. */
    center: geometry({ type: 'point', mode: 'xy', srid: 4326 }),
    radiusKm: integer(),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('operating_zones_name_key').on(sql`lower(${t.name})`),
    uniqueIndex('operating_zones_slug_key').on(t.slug),
    check(
      'operating_zones_commission_range',
      sql`${t.commissionRate} is null or (${t.commissionRate} >= 0 and ${t.commissionRate} <= 100)`,
    ),
    check(
      'operating_zones_area',
      sql`(${t.center} is null) = (${t.radiusKm} is null) and (${t.radiusKm} is null or ${t.radiusKm} between 1 and 500)`,
    ),
  ],
);

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
    /** Null = not assigned to a zone yet (sells as if its zone were active). */
    zoneId: uuid().references(() => operatingZones.id, { onDelete: 'set null' }),
    ...timestamps,
  },
  (t) => [
    index('stops_zone_idx').on(t.zoneId),
    uniqueIndex('stops_name_city_key').on(sql`lower(${t.name})`, sql`lower(${t.city})`),
    index('stops_location_idx').using('gist', t.location),
  ],
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
    status: routeStatus().notNull().default('draft'),
    createdBy: uuid().references(() => users.id, { onDelete: 'set null' }),
    ...timestamps,
  },
  (t) => [index('routes_organization_idx').on(t.organizationId, t.status)],
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
    ...timestamps,
  },
  (t) => [
    index('route_schedules_route_idx').on(t.routeId),
    check('route_schedules_seats_check', sql`${t.seats} between 1 and 100`),
    check(
      'route_schedules_validity_check',
      sql`${t.validUntil} is null or ${t.validUntil} >= ${t.validFrom}`,
    ),
  ],
);

export type StopRow = typeof stops.$inferSelect;
export type OperatingZoneRow = typeof operatingZones.$inferSelect;
export type RouteRow = typeof routes.$inferSelect;
export type RouteStopRow = typeof routeStops.$inferSelect;
export type RouteFareRow = typeof routeFares.$inferSelect;
export type RouteScheduleRow = typeof routeSchedules.$inferSelect;
