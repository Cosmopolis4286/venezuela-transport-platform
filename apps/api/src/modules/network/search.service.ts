import { HttpStatus, Injectable } from '@nestjs/common';
import { serviceOpen, type Departure, type Service, type TransportMode } from '@vtp/shared-types';
import { and, eq, gt, inArray } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { ApiException } from '../../common/errors/api.exception.js';
import { DatabaseService } from '../../database/database.service.js';
import { trips } from '../bookings/bookings.schema.js';
import { takenSeatCounts } from '../bookings/occupancy.js';
import { organizations } from '../organizations/organizations.schema.js';
import { addDays, isCalendarDate, occurrencesOn, todayInVenezuela } from './departures.js';
import { routeFares, routes, routeSchedules, routeStops } from './network.schema.js';
import { ServicesService } from './services.service.js';
import { StopsService } from './stops.service.js';

/** How far ahead passengers can search. */
const SEARCH_HORIZON_DAYS = 180;

@Injectable()
export class SearchService {
  constructor(
    private readonly database: DatabaseService,
    private readonly stops: StopsService,
    private readonly services: ServicesService,
  ) {}

  /**
   * Departures from `from` to `to` on `date` (local), computed from the published schedules of
   * active routes of active organizations. Nothing is stored per trip yet.
   */
  async departures(
    from: string,
    to: string,
    date: string,
    mode?: TransportMode,
    service?: Service,
  ): Promise<Departure[]> {
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
        mode: routes.mode,
        service: routes.service,
        serviceAreaId: routes.serviceAreaId,
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
      .innerJoin(
        routes,
        and(
          eq(routes.id, boarding.routeId),
          eq(routes.status, 'active'),
          mode ? eq(routes.mode, mode) : undefined,
          service ? eq(routes.service, service) : undefined,
        ),
      )
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
    // Services switched off are not on sale (ADR-029).
    const status = await this.services.status();
    const open = rows.filter((row) =>
      serviceOpen(status, {
        service: row.service,
        serviceAreaId: row.serviceAreaId,
        from: stops.get(from)!,
        to: stops.get(to)!,
      }),
    );
    if (!open.length) return [];
    const taken = await takenSeatCounts(
      this.database.db,
      open.map((row) => row.schedule.id),
    );
    // Departures the operator cancelled are not offered.
    const cancelled = new Set(
      (
        await this.database.db
          .select({ scheduleId: trips.scheduleId, serviceDate: trips.serviceDate })
          .from(trips)
          .where(
            and(
              inArray(
                trips.scheduleId,
                open.map((row) => row.schedule.id),
              ),
              eq(trips.status, 'cancelled'),
            ),
          )
      ).map((t) => `${t.scheduleId}:${t.serviceDate}`),
    );
    const departures: Departure[] = open.flatMap((row) =>
      occurrencesOn(date, row.schedule, row.fromOffset, row.toOffset)
        .filter((trip) => !cancelled.has(`${row.schedule.id}:${trip.serviceDate}`))
        .map((trip) => ({
          scheduleId: row.schedule.id,
          mode: row.mode,
          service: row.service,
          serviceAreaId: row.serviceAreaId,
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
          seatsAvailable: Math.max(
            0,
            row.schedule.seats - (taken.get(`${row.schedule.id}:${trip.serviceDate}`) ?? 0),
          ),
          fare: row.fare?.amount && row.fare.currency ? (row.fare as Departure['fare']) : null,
        })),
    );
    // Same offset everywhere, so the ISO strings sort chronologically.
    return departures.sort((a, b) => a.departsAt.localeCompare(b.departsAt));
  }
}

const invalid = (message: string) =>
  new ApiException('VALIDATION_FAILED', message, HttpStatus.BAD_REQUEST);
