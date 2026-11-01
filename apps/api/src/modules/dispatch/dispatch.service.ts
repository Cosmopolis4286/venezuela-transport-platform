import { HttpStatus, Injectable } from '@nestjs/common';
import {
  DEPART_EARLY_HOURS,
  NETWORK_UTC_OFFSET,
  rolesWith,
  toNetworkIso,
  type AssignTripRequest,
  type DispatchBoard,
  type DispatchDeparture,
  type DriverManifest,
  type DriverTrip,
  type TripDriver,
} from '@vtp/shared-types';
import { and, asc, eq, gt, inArray, isNotNull, isNull, lt, ne, sql } from 'drizzle-orm';
import { ApiException } from '../../common/errors/api.exception.js';
import { DatabaseService, type Transaction } from '../../database/database.service.js';
import { AuditService } from '../audit/audit.service.js';
import { departureText } from '../notifications/format.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { trips, type TripRow } from '../bookings/bookings.schema.js';
import { BookingsService, summary } from '../bookings/bookings.service.js';
import { TripsService } from '../bookings/trips.service.js';
import { vehicles } from '../fleet/fleet.schema.js';
import { VehiclesService } from '../fleet/vehicles.service.js';
import { users } from '../identity/identity.schema.js';
import type { Authenticated, RequestMeta } from '../identity/sessions.service.js';
import {
  addDays,
  isCalendarDate,
  MAX_MINUTES_FROM_ORIGIN,
  occurrenceOnServiceDate,
  todayInVenezuela,
} from '../network/departures.js';
import { routes, routeSchedules, routeStops } from '../network/network.schema.js';
import { StopsService } from '../network/stops.service.js';
import type { OrganizationAccess } from '../organizations/organization-access.js';
import { memberships, organizations } from '../organizations/organizations.schema.js';

/** How far back and ahead the board and assignments reach. */
const PAST_DAYS = 7;
const AHEAD_DAYS = 180;
/** Drivers see their trips until this long after arrival. */
const DRIVER_GRACE_MS = 12 * 3600_000;
const MINUTE_MS = 60_000;

const DRIVING_ROLES = rolesWith('trips.drive');

const conflict = ApiException.conflict;
const invalid = (message: string) =>
  new ApiException('VALIDATION_FAILED', message, HttpStatus.BAD_REQUEST);
const tripNotFound = () => new ApiException('NOT_FOUND', 'Trip not found', HttpStatus.NOT_FOUND);

interface RouteEnds {
  firstStopId: string;
  lastStopId: string;
  /** Minutes from the origin to the last stop. */
  duration: number;
}

/** Assigns vehicles and drivers to trips, and shows drivers their trips. */
@Injectable()
export class DispatchService {
  constructor(
    private readonly database: DatabaseService,
    private readonly audit: AuditService,
    private readonly bookings: BookingsService,
    private readonly trips: TripsService,
    private readonly vehicles: VehiclesService,
    private readonly stops: StopsService,
    private readonly notifications: NotificationsService,
  ) {}

  /** Every departure of the organization on `date`, booked or not, with its assignment. */
  async board(organizationId: string, date: string): Promise<DispatchBoard> {
    assertDate(date, PAST_DAYS);
    const [schedules, booked, fleet, drivers] = await Promise.all([
      this.database.db
        .select({
          schedule: routeSchedules,
          route: { id: routes.id, name: routes.name, status: routes.status },
        })
        .from(routeSchedules)
        .innerJoin(routes, eq(routes.id, routeSchedules.routeId))
        .where(eq(routes.organizationId, organizationId)),
      this.bookings.tripsOn(organizationId, date),
      this.vehicles.list(organizationId),
      this.drivers(organizationId),
    ]);
    const ends = await this.routeEnds(schedules.map((s) => s.route.id));
    const byId = new Map(schedules.map((s) => [s.schedule.id, s]));

    const departures: DispatchDeparture[] = booked.map((trip) => {
      const departsAt = `${trip.serviceDate}T${trip.departureTime}:00${NETWORK_UTC_OFFSET}`;
      return {
        scheduleId: trip.scheduleId,
        serviceDate: trip.serviceDate,
        tripId: trip.id,
        route: trip.route,
        departsAt,
        arrivesAt: later(departsAt, ends.get(trip.route.id)?.duration ?? 0),
        serviceClass: trip.serviceClass,
        seatLayoutId: byId.get(trip.scheduleId)?.schedule.seatLayoutId ?? null,
        capacity: trip.capacity,
        soldSeats: trip.soldSeats,
        heldSeats: trip.heldSeats,
        vehicle: trip.vehicle,
        driver: trip.driver,
        departedAt: trip.departedAt,
        arrivedAt: trip.arrivedAt,
      };
    });
    const withTrip = new Set(booked.map((t) => t.scheduleId));
    for (const { schedule, route } of schedules) {
      const end = ends.get(route.id);
      if (withTrip.has(schedule.id) || !schedule.active || route.status !== 'active' || !end) {
        continue;
      }
      const occurrence = occurrenceOnServiceDate(date, schedule, 0, end.duration);
      if (!occurrence) continue;
      departures.push({
        scheduleId: schedule.id,
        serviceDate: date,
        tripId: null,
        route: { id: route.id, name: route.name },
        departsAt: occurrence.departsAt,
        arrivesAt: occurrence.arrivesAt,
        serviceClass: schedule.serviceClass,
        seatLayoutId: schedule.seatLayoutId,
        capacity: schedule.seats,
        soldSeats: 0,
        heldSeats: 0,
        vehicle: null,
        driver: null,
        departedAt: null,
        arrivedAt: null,
      });
    }
    return {
      date,
      departures: departures.sort(
        (a, b) =>
          a.departsAt.localeCompare(b.departsAt) || a.route.name.localeCompare(b.route.name),
      ),
      vehicles: fleet
        .filter((v) => v.active)
        .map((v) => ({
          id: v.id,
          plate: v.plate,
          label: v.label,
          seatLayoutId: v.seatLayout?.id ?? null,
          documentAlert: v.documentAlert,
        })),
      drivers,
    };
  }

  /**
   * Sets the vehicle and driver of one departure. A vehicle must be active and have the
   * departure's seat map (when both have one); neither may be on another trip at the same time.
   */
  async assign(
    access: OrganizationAccess,
    input: AssignTripRequest,
    actor: Authenticated,
    meta: RequestMeta,
  ): Promise<DispatchDeparture> {
    const organizationId = access.organization.id;
    assertDate(input.serviceDate, 1);
    const vehicle = input.vehicleId
      ? await this.vehicles.require(organizationId, input.vehicleId)
      : null;
    if (vehicle && !vehicle.active) throw conflict('This vehicle is inactive', 'VEHICLE_INACTIVE');
    if (
      input.driverUserId &&
      !(await this.drivers(organizationId)).some((d) => d.userId === input.driverUserId)
    ) {
      throw invalid('The driver must be a member whose role drives');
    }
    const trip = await this.trips.ensure(organizationId, input.scheduleId, input.serviceDate);
    if (trip.status !== 'scheduled') throw conflict('This trip is cancelled', 'TRIP_CANCELLED');
    const [schedule] = await this.database.db
      .select({ seatLayoutId: routeSchedules.seatLayoutId })
      .from(routeSchedules)
      .where(eq(routeSchedules.id, trip.scheduleId));
    if (
      vehicle?.seatLayoutId &&
      schedule?.seatLayoutId &&
      vehicle.seatLayoutId !== schedule.seatLayoutId
    ) {
      throw conflict(
        'This vehicle has a different seat map than the departure',
        'VEHICLE_LAYOUT_MISMATCH',
      );
    }

    const duration = (await this.routeEnds([trip.routeId])).get(trip.routeId)?.duration ?? 0;
    const window = { start: trip.departsAt, end: new Date(+trip.departsAt + duration * MINUTE_MS) };
    await this.database.db.transaction(async (tx) => {
      // Serializes assignments of the same vehicle or driver, whatever the organization.
      for (const key of [input.vehicleId, input.driverUserId].filter(Boolean).sort()) {
        await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${key}))`);
      }
      if (
        input.vehicleId &&
        (await this.busy(tx, trips.vehicleId, input.vehicleId, trip, window))
      ) {
        throw conflict('This vehicle is on another trip at that time', 'VEHICLE_BUSY');
      }
      if (
        input.driverUserId &&
        (await this.busy(tx, trips.driverUserId, input.driverUserId, trip, window))
      ) {
        throw conflict('This driver is on another trip at that time', 'DRIVER_BUSY');
      }
      await tx
        .update(trips)
        .set({ vehicleId: input.vehicleId, driverUserId: input.driverUserId })
        .where(eq(trips.id, trip.id));
    });
    await this.audit.record({
      action: 'trip.assigned',
      actorUserId: actor.user.id,
      targetType: 'trip',
      targetId: trip.id,
      ip: meta.ip,
      metadata: {
        organizationId,
        vehicleId: input.vehicleId,
        driverUserId: input.driverUserId,
      },
    });
    if (input.driverUserId && input.driverUserId !== trip.driverUserId) {
      const driverUserId = input.driverUserId;
      this.notifications.later(async () => {
        const [route] = await this.database.db
          .select({ name: routes.name })
          .from(routes)
          .where(eq(routes.id, trip.routeId));
        return {
          kind: 'trip_assigned',
          userIds: [driverUserId],
          app: 'transport',
          reference: { key: 'tripId', id: trip.id },
          text: (m, locale) =>
            m.tripAssigned(
              route?.name ?? '',
              departureText(trip.departsAt, locale),
              vehicle?.plate ?? null,
            ),
        };
      });
    }
    const board = await this.board(organizationId, trip.serviceDate);
    return board.departures.find((d) => d.tripId === trip.id)!;
  }

  /**
   * The assigned driver marks that the bus left (from `DEPART_EARLY_HOURS` before the scheduled
   * departure) and later that it arrived. Each step happens once and in order.
   */
  async markTrip(
    actor: Authenticated,
    tripId: string,
    step: 'depart' | 'arrive',
    meta: RequestMeta,
  ): Promise<DriverTrip> {
    const [row] = await this.drivenTrips(actor.user.id, null, tripId);
    if (!row) throw tripNotFound();
    const now = new Date();
    if (step === 'depart') {
      if (+row.trip.departsAt - DEPART_EARLY_HOURS * 3_600_000 > +now) {
        throw conflict('Too early to mark the departure', 'TRIP_TOO_EARLY');
      }
    }
    const [updated] = await this.database.db
      .update(trips)
      .set(step === 'depart' ? { departedAt: now } : { arrivedAt: now })
      .where(
        and(
          eq(trips.id, tripId),
          step === 'depart'
            ? isNull(trips.departedAt)
            : and(isNotNull(trips.departedAt), isNull(trips.arrivedAt)),
        ),
      )
      .returning({ id: trips.id });
    if (!updated) {
      throw conflict(
        step === 'depart' ? 'The departure was already marked' : 'Mark the departure first, once',
        'TRIP_WRONG_STEP',
      );
    }
    await this.audit.record({
      action: step === 'depart' ? 'trip.departed' : 'trip.arrived',
      actorUserId: actor.user.id,
      targetType: 'trip',
      targetId: tripId,
      ip: meta.ip,
    });
    const [trip] = await this.toDriverTrips(
      await this.drivenTrips(actor.user.id, null, tripId),
      null,
    );
    return trip!;
  }

  /** Trips assigned to the user, while they are still a driving member of the organization. */
  async driving(userId: string, now = new Date()): Promise<DriverTrip[]> {
    const rows = await this.drivenTrips(userId, now);
    return this.toDriverTrips(rows, now);
  }

  async driverManifest(userId: string, tripId: string): Promise<DriverManifest> {
    const rows = await this.drivenTrips(userId, null, tripId);
    const [trip] = await this.toDriverTrips(rows, null);
    if (!trip) throw tripNotFound();
    const manifest = await this.bookings.manifest(trip.organization.id, tripId);
    return {
      ...trip,
      // Drivers see who boards and alights where; documents stay with the inspectors.
      passengers: manifest.passengers.map((p) => ({
        seatNumber: p.seatNumber,
        firstName: p.firstName,
        lastName: p.lastName,
        bookingStatus: p.bookingStatus,
        from: p.from,
        to: p.to,
        boardedAt: p.boardedAt,
      })),
    };
  }

  /** Members whose role drives. */
  private async drivers(organizationId: string): Promise<TripDriver[]> {
    return this.database.db
      .select({ userId: users.id, firstName: users.firstName, lastName: users.lastName })
      .from(memberships)
      .innerJoin(users, eq(users.id, memberships.userId))
      .where(
        and(
          eq(memberships.organizationId, organizationId),
          inArray(memberships.role, DRIVING_ROLES),
        ),
      )
      .orderBy(asc(users.firstName), asc(users.lastName));
  }

  /** Whether `column` = `id` on another scheduled trip overlapping `window`. */
  private async busy(
    tx: Transaction,
    column: typeof trips.vehicleId | typeof trips.driverUserId,
    id: string,
    trip: TripRow,
    window: { start: Date; end: Date },
  ): Promise<boolean> {
    const others = await tx
      .select({ departsAt: trips.departsAt, routeId: trips.routeId })
      .from(trips)
      .where(
        and(
          eq(column, id),
          ne(trips.id, trip.id),
          eq(trips.status, 'scheduled'),
          lt(trips.departsAt, window.end),
          gt(trips.departsAt, new Date(+window.start - MAX_MINUTES_FROM_ORIGIN * MINUTE_MS)),
        ),
      );
    if (!others.length) return false;
    const ends = await this.routeEnds(others.map((o) => o.routeId));
    return others.some(
      (o) => +o.departsAt + (ends.get(o.routeId)?.duration ?? 0) * MINUTE_MS > +window.start,
    );
  }

  /** First and last stop of each route. */
  private async routeEnds(routeIds: string[]): Promise<Map<string, RouteEnds>> {
    const ids = [...new Set(routeIds)];
    if (!ids.length) return new Map();
    const rows = await this.database.db
      .select({
        routeId: routeStops.routeId,
        stopId: routeStops.stopId,
        minutes: routeStops.minutesFromOrigin,
      })
      .from(routeStops)
      .where(inArray(routeStops.routeId, ids))
      .orderBy(asc(routeStops.routeId), asc(routeStops.sequence));
    const ends = new Map<string, RouteEnds>();
    for (const row of rows) {
      const end = ends.get(row.routeId);
      if (end) Object.assign(end, { lastStopId: row.stopId, duration: row.minutes });
      else ends.set(row.routeId, { firstStopId: row.stopId, lastStopId: row.stopId, duration: 0 });
    }
    return ends;
  }

  /** Recent and upcoming trips the user drives (`now` null: any time, for one trip). */
  private drivenTrips(userId: string, now: Date | null, tripId?: string) {
    return this.database.db
      .select({
        trip: trips,
        route: { id: routes.id, name: routes.name },
        serviceClass: routeSchedules.serviceClass,
        organization: {
          id: organizations.id,
          legalName: organizations.legalName,
          tradeName: organizations.tradeName,
        },
        vehicle: { id: vehicles.id, plate: vehicles.plate, label: vehicles.label },
      })
      .from(trips)
      .innerJoin(routes, eq(routes.id, trips.routeId))
      .innerJoin(routeSchedules, eq(routeSchedules.id, trips.scheduleId))
      .innerJoin(organizations, eq(organizations.id, trips.organizationId))
      .innerJoin(
        memberships,
        and(
          eq(memberships.organizationId, trips.organizationId),
          eq(memberships.userId, userId),
          inArray(memberships.role, DRIVING_ROLES),
        ),
      )
      .leftJoin(vehicles, eq(vehicles.id, trips.vehicleId))
      .where(
        and(
          eq(trips.driverUserId, userId),
          eq(trips.status, 'scheduled'),
          tripId ? eq(trips.id, tripId) : undefined,
          now
            ? gt(trips.departsAt, new Date(+now - MAX_MINUTES_FROM_ORIGIN * MINUTE_MS))
            : undefined,
        ),
      )
      .orderBy(asc(trips.departsAt))
      .limit(100);
  }

  private async toDriverTrips(
    rows: Awaited<ReturnType<DispatchService['drivenTrips']>>,
    now: Date | null,
  ): Promise<DriverTrip[]> {
    if (!rows.length) return [];
    const [ends, counts] = await Promise.all([
      this.routeEnds(rows.map((r) => r.route.id)),
      this.bookings.seatCounts(rows.map((r) => r.trip.id)),
    ]);
    const stops = await this.stops.summaries(
      [...ends.values()].flatMap((e) => [e.firstStopId, e.lastStopId]),
    );
    return rows.flatMap((row) => {
      const end = ends.get(row.route.id);
      if (!end) return [];
      const arrival = new Date(+row.trip.departsAt + end.duration * MINUTE_MS);
      if (now && +arrival + DRIVER_GRACE_MS < +now) return [];
      const {
        vehicle: _vehicle,
        driver: _driver,
        ...trip
      } = summary({ ...row, driver: null }, counts);
      return [
        {
          ...trip,
          organization: row.organization,
          departsAt: toNetworkIso(row.trip.departsAt),
          arrivesAt: toNetworkIso(arrival),
          from: stops.get(end.firstStopId)!,
          to: stops.get(end.lastStopId)!,
          vehicle: row.vehicle,
        },
      ];
    });
  }
}

function assertDate(date: string, pastDays: number) {
  if (!isCalendarDate(date)) throw invalid('date is not a valid date');
  const today = todayInVenezuela();
  if (date < addDays(today, -pastDays) || date > addDays(today, AHEAD_DAYS)) {
    throw invalid(`Choose a date between ${pastDays} days ago and ${AHEAD_DAYS} days ahead`);
  }
}

/** Local ISO timestamp `minutes` after another one. */
function later(localIso: string, minutes: number): string {
  return toNetworkIso(new Date(Date.parse(localIso) + minutes * MINUTE_MS));
}
