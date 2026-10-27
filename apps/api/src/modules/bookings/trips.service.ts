import { HttpStatus, Injectable } from '@nestjs/common';
import type { StopSummary, TripAvailability } from '@vtp/shared-types';
import { and, eq, inArray } from 'drizzle-orm';
import { ApiException } from '../../common/errors/api.exception.js';
import { DatabaseService, type Transaction } from '../../database/database.service.js';
import { seatLayouts } from '../fleet/fleet.schema.js';
import { occurrenceOnServiceDate, type Occurrence } from '../network/departures.js';
import {
  routeFares,
  routes,
  routeSchedules,
  routeStops,
  type RouteScheduleRow,
} from '../network/network.schema.js';
import { StopsService } from '../network/stops.service.js';
import { organizations } from '../organizations/organizations.schema.js';
import {
  bookingPassengers,
  bookings,
  trips,
  type TripLayout,
  type TripRow,
} from './bookings.schema.js';
import { occupiesSeat } from './occupancy.js';

/** Everything needed to show or book one departure between two stops. */
export interface DepartureContext {
  schedule: RouteScheduleRow;
  route: { id: string; name: string };
  operator: TripAvailability['operator'];
  from: StopSummary;
  to: StopSummary;
  occurrence: Occurrence;
  fare: TripAvailability['fare'];
  /** Current seat map of the schedule (a trip keeps its own snapshot once created). */
  layout: TripLayout | null;
}

const unavailable = () =>
  new ApiException('NOT_FOUND', 'This departure is not available', HttpStatus.NOT_FOUND);

@Injectable()
export class TripsService {
  constructor(
    private readonly database: DatabaseService,
    private readonly stops: StopsService,
  ) {}

  /**
   * Resolves a published departure: active schedule on an active route of an active organization,
   * running on `serviceDate`, with `from` before `to`. Anything else is 404.
   */
  async resolve(
    scheduleId: string,
    serviceDate: string,
    fromStopId: string,
    toStopId: string,
  ): Promise<DepartureContext> {
    const [row] = await this.database.db
      .select({
        schedule: routeSchedules,
        route: { id: routes.id, name: routes.name, status: routes.status },
        operator: {
          id: organizations.id,
          type: organizations.type,
          legalName: organizations.legalName,
          tradeName: organizations.tradeName,
          status: organizations.status,
        },
      })
      .from(routeSchedules)
      .innerJoin(routes, eq(routes.id, routeSchedules.routeId))
      .innerJoin(organizations, eq(organizations.id, routes.organizationId))
      .where(eq(routeSchedules.id, scheduleId));
    if (
      !row ||
      !row.schedule.active ||
      row.route.status !== 'active' ||
      row.operator.status !== 'active'
    ) {
      throw unavailable();
    }
    const offsets = await this.database.db
      .select({
        stopId: routeStops.stopId,
        sequence: routeStops.sequence,
        minutes: routeStops.minutesFromOrigin,
      })
      .from(routeStops)
      .where(
        and(
          eq(routeStops.routeId, row.route.id),
          inArray(routeStops.stopId, [fromStopId, toStopId]),
        ),
      );
    const boarding = offsets.find((o) => o.stopId === fromStopId);
    const alighting = offsets.find((o) => o.stopId === toStopId);
    if (!boarding || !alighting || boarding.sequence >= alighting.sequence) throw unavailable();
    const occurrence = occurrenceOnServiceDate(
      serviceDate,
      row.schedule,
      boarding.minutes,
      alighting.minutes,
    );
    if (!occurrence) throw unavailable();

    const [fare] = await this.database.db
      .select({ amount: routeFares.amount, currency: routeFares.currency })
      .from(routeFares)
      .where(
        and(
          eq(routeFares.routeId, row.route.id),
          eq(routeFares.fromStopId, fromStopId),
          eq(routeFares.toStopId, toStopId),
        ),
      );
    const [layout] = row.schedule.seatLayoutId
      ? await this.database.db
          .select({
            decks: seatLayouts.decks,
            rows: seatLayouts.rows,
            columns: seatLayouts.columns,
            seats: seatLayouts.seats,
          })
          .from(seatLayouts)
          .where(eq(seatLayouts.id, row.schedule.seatLayoutId))
      : [];
    const stops = await this.stops.summaries([fromStopId, toStopId]);
    const { status: _routeStatus, ...route } = row.route;
    const { status: _operatorStatus, ...operator } = row.operator;
    return {
      schedule: row.schedule,
      route,
      operator,
      from: stops.get(fromStopId)!,
      to: stops.get(toStopId)!,
      occurrence,
      fare: fare ?? null,
      layout: layout ?? null,
    };
  }

  async availability(
    scheduleId: string,
    serviceDate: string,
    fromStopId: string,
    toStopId: string,
  ): Promise<TripAvailability> {
    const context = await this.resolve(scheduleId, serviceDate, fromStopId, toStopId);
    const [trip] = await this.database.db
      .select()
      .from(trips)
      .where(and(eq(trips.scheduleId, scheduleId), eq(trips.serviceDate, serviceDate)));
    const taken = trip
      ? await this.database.db
          .select({ seatNumber: bookingPassengers.seatNumber })
          .from(bookingPassengers)
          .innerJoin(bookings, and(eq(bookings.id, bookingPassengers.bookingId), occupiesSeat()))
          .where(and(eq(bookingPassengers.tripId, trip.id), eq(bookingPassengers.active, true)))
      : [];
    const layout = trip ? trip.layout : context.layout;
    return {
      scheduleId,
      serviceDate,
      operator: context.operator,
      route: context.route,
      from: context.from,
      to: context.to,
      departsAt: context.occurrence.departsAt,
      arrivesAt: context.occurrence.arrivesAt,
      serviceClass: context.schedule.serviceClass,
      layout,
      capacity: trip ? trip.capacity : context.schedule.seats,
      takenSeats: taken.map((t) => t.seatNumber).sort(compareSeats),
      fare: context.fare,
      bookable: isBookable(context),
    };
  }

  /** The trip row for this departure, created (with a seat map snapshot) on first use. */
  async getOrCreate(tx: Transaction, context: DepartureContext): Promise<TripRow> {
    const { schedule, occurrence } = context;
    const departureTime = schedule.departureTime.slice(0, 5);
    await tx
      .insert(trips)
      .values({
        scheduleId: schedule.id,
        routeId: context.route.id,
        organizationId: context.operator.id,
        serviceDate: occurrence.serviceDate,
        departsAt: new Date(`${occurrence.serviceDate}T${departureTime}:00-04:00`),
        layout: context.layout,
        capacity: schedule.seats,
      })
      .onConflictDoNothing({ target: [trips.scheduleId, trips.serviceDate] });
    const [trip] = await tx
      .select()
      .from(trips)
      .where(and(eq(trips.scheduleId, schedule.id), eq(trips.serviceDate, occurrence.serviceDate)));
    return trip!;
  }
}

/** Bookable while the vehicle has not left the boarding stop and there is a price. */
export function isBookable(context: DepartureContext, now = Date.now()): boolean {
  return context.fare !== null && Date.parse(context.occurrence.departsAt) > now;
}

/** Seat numbers that exist on a trip: the map's, or `1`…`capacity`. */
export function seatNumbersOf(trip: Pick<TripRow, 'layout' | 'capacity'>): Set<string> {
  return new Set(
    trip.layout
      ? trip.layout.seats.map((s) => s.number)
      : Array.from({ length: trip.capacity }, (_, i) => String(i + 1)),
  );
}

/** Numeric seats in numeric order, then the rest alphabetically. */
export function compareSeats(a: string, b: string): number {
  return a.localeCompare(b, 'es', { numeric: true });
}
