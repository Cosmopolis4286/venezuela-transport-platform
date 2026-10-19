import { HttpStatus, Injectable } from '@nestjs/common';
import type { Departure } from '@vtp/shared-types';
import { and, eq, gt } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { ApiException } from '../../common/errors/api.exception.js';
import { DatabaseService } from '../../database/database.service.js';
import { organizations } from '../organizations/organizations.schema.js';
import { addDays, isCalendarDate, occurrencesOn, todayInVenezuela } from './departures.js';
import { routeFares, routes, routeSchedules, routeStops } from './network.schema.js';
import { StopsService } from './stops.service.js';

/** How far ahead passengers can search. */
const SEARCH_HORIZON_DAYS = 180;

@Injectable()
export class SearchService {
  constructor(
    private readonly database: DatabaseService,
    private readonly stops: StopsService,
  ) {}

  /**
   * Departures from `from` to `to` on `date` (local), computed from the published schedules of
   * active routes of active organizations. Nothing is stored per trip yet.
   */
  async departures(from: string, to: string, date: string): Promise<Departure[]> {
    if (from === to) throw invalid('Choose different stops for origin and destination');
    if (!isCalendarDate(date)) throw invalid('date is not a valid date');
    const today = todayInVenezuela();
    if (date < today || date > addDays(today, SEARCH_HORIZON_DAYS)) {
      throw invalid(`Search between today and ${SEARCH_HORIZON_DAYS} days ahead`);
    }

    const boarding = alias(routeStops, 'boarding');
    const alighting = alias(routeStops, 'alighting');
    const rows = await this.database.db
      .select({
        schedule: routeSchedules,
        route: { id: routes.id, name: routes.name },
        operator: {
          id: organizations.id,
          type: organizations.type,
          legalName: organizations.legalName,
          tradeName: organizations.tradeName,
        },
        fromOffset: boarding.minutesFromOrigin,
        toOffset: alighting.minutesFromOrigin,
        fare: { amount: routeFares.amount, currency: routeFares.currency },
      })
      .from(boarding)
      .innerJoin(
        alighting,
        and(eq(alighting.routeId, boarding.routeId), gt(alighting.sequence, boarding.sequence)),
      )
      .innerJoin(routes, and(eq(routes.id, boarding.routeId), eq(routes.status, 'active')))
      .innerJoin(
        organizations,
        and(eq(organizations.id, routes.organizationId), eq(organizations.status, 'active')),
      )
      .innerJoin(
        routeSchedules,
        and(eq(routeSchedules.routeId, routes.id), eq(routeSchedules.active, true)),
      )
      .leftJoin(
        routeFares,
        and(
          eq(routeFares.routeId, routes.id),
          eq(routeFares.fromStopId, boarding.stopId),
          eq(routeFares.toStopId, alighting.stopId),
        ),
      )
      .where(and(eq(boarding.stopId, from), eq(alighting.stopId, to)));
    if (!rows.length) return [];

    const stops = await this.stops.summaries([from, to]);
    const departures: Departure[] = rows.flatMap((row) =>
      occurrencesOn(date, row.schedule, row.fromOffset, row.toOffset).map((trip) => ({
        scheduleId: row.schedule.id,
        serviceDate: trip.serviceDate,
        operator: row.operator,
        route: row.route,
        from: stops.get(from)!,
        to: stops.get(to)!,
        departsAt: trip.departsAt,
        arrivesAt: trip.arrivesAt,
        durationMinutes: trip.durationMinutes,
        serviceClass: row.schedule.serviceClass,
        seats: row.schedule.seats,
        fare: row.fare?.amount && row.fare.currency ? (row.fare as Departure['fare']) : null,
      })),
    );
    // Same offset everywhere, so the ISO strings sort chronologically.
    return departures.sort((a, b) => a.departsAt.localeCompare(b.departsAt));
  }
}

const invalid = (message: string) =>
  new ApiException('VALIDATION_FAILED', message, HttpStatus.BAD_REQUEST);
