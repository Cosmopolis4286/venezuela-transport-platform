import { HttpStatus, Injectable } from '@nestjs/common';
import {
  runsRoutes,
  type Fare,
  type Route,
  type RouteInput,
  type RouteStatus,
  type RouteSummary,
  type Schedule,
  type ScheduleInput,
} from '@vtp/shared-types';
import { and, asc, count, eq, inArray } from 'drizzle-orm';
import { ApiException } from '../../common/errors/api.exception.js';
import { DatabaseService, type Transaction } from '../../database/database.service.js';
import { AuditService } from '../audit/audit.service.js';
import { FleetService } from '../fleet/fleet.service.js';
import type { Authenticated, RequestMeta } from '../identity/sessions.service.js';
import type { OrganizationAccess } from '../organizations/organization-access.js';
import {
  routeFares,
  routes,
  routeSchedules,
  routeStops,
  stops,
  type RouteRow,
  type RouteScheduleRow,
} from './network.schema.js';
import { isCalendarDate } from './departures.js';
import { toSummary } from './stops.service.js';

const MAX_SCHEDULES_PER_ROUTE = 100;

/** Allowed status changes. A route never goes back to draft once published. */
const STATUS_TRANSITIONS: Record<RouteStatus, RouteStatus[]> = {
  draft: ['active'],
  active: ['inactive'],
  inactive: ['active'],
};

const invalid = (message: string) =>
  new ApiException('VALIDATION_FAILED', message, HttpStatus.BAD_REQUEST);
const conflict = (message: string) => new ApiException('CONFLICT', message, HttpStatus.CONFLICT);
const notFound = (message = 'Route not found') =>
  new ApiException('NOT_FOUND', message, HttpStatus.NOT_FOUND);

@Injectable()
export class RoutesService {
  constructor(
    private readonly database: DatabaseService,
    private readonly audit: AuditService,
    private readonly fleet: FleetService,
  ) {}

  async list(organizationId: string): Promise<RouteSummary[]> {
    const rows = await this.database.db
      .select()
      .from(routes)
      .where(eq(routes.organizationId, organizationId))
      .orderBy(asc(routes.name));
    if (!rows.length) return [];
    const ids = rows.map((r) => r.id);
    const stopRows = await this.database.db
      .select({ routeId: routeStops.routeId, sequence: routeStops.sequence, stop: stops })
      .from(routeStops)
      .innerJoin(stops, eq(stops.id, routeStops.stopId))
      .where(inArray(routeStops.routeId, ids))
      .orderBy(asc(routeStops.routeId), asc(routeStops.sequence));
    const scheduleCounts = await this.database.db
      .select({ routeId: routeSchedules.routeId, total: count() })
      .from(routeSchedules)
      .where(inArray(routeSchedules.routeId, ids))
      .groupBy(routeSchedules.routeId);
    return rows.map((route) => {
      const own = stopRows.filter((s) => s.routeId === route.id);
      return {
        id: route.id,
        name: route.name,
        status: route.status,
        origin: toSummary(own[0]!.stop),
        destination: toSummary(own.at(-1)!.stop),
        stopCount: own.length,
        scheduleCount: scheduleCounts.find((c) => c.routeId === route.id)?.total ?? 0,
      };
    });
  }

  async get(access: OrganizationAccess, routeId: string): Promise<Route> {
    return this.load(await this.requireRoute(access, routeId));
  }

  async create(
    access: OrganizationAccess,
    input: RouteInput,
    actor: Authenticated,
    meta: RequestMeta,
  ): Promise<Route> {
    if (!runsRoutes(access.organization.type)) {
      throw conflict('Only bus companies and taxi lines publish routes');
    }
    await this.assertStops(input.stops);
    const route = await this.database.db.transaction(async (tx) => {
      const [row] = await tx
        .insert(routes)
        .values({
          organizationId: access.organization.id,
          name: input.name.trim(),
          createdBy: actor.user.id,
        })
        .returning();
      await this.writeStops(tx, row!.id, input.stops);
      return row!;
    });
    await this.record('route.created', route, actor, meta);
    return this.load(route);
  }

  /** Renames and/or replaces the stops. Fares that no longer fit the new order are dropped. */
  async update(
    access: OrganizationAccess,
    routeId: string,
    input: Partial<RouteInput>,
    actor: Authenticated,
    meta: RequestMeta,
  ): Promise<Route> {
    const route = await this.requireRoute(access, routeId);
    if (input.stops) await this.assertStops(input.stops);
    let droppedFares = 0;
    await this.database.db.transaction(async (tx) => {
      if (input.name) {
        await tx.update(routes).set({ name: input.name.trim() }).where(eq(routes.id, route.id));
      }
      if (input.stops) {
        await tx.delete(routeStops).where(eq(routeStops.routeId, route.id));
        await this.writeStops(tx, route.id, input.stops);
        const order = new Map(input.stops.map((s, index) => [s.stopId, index]));
        const fares = await tx.select().from(routeFares).where(eq(routeFares.routeId, route.id));
        for (const fare of fares) {
          const from = order.get(fare.fromStopId);
          const to = order.get(fare.toStopId);
          if (from === undefined || to === undefined || from >= to) {
            droppedFares += 1;
            await tx
              .delete(routeFares)
              .where(
                and(
                  eq(routeFares.routeId, route.id),
                  eq(routeFares.fromStopId, fare.fromStopId),
                  eq(routeFares.toStopId, fare.toStopId),
                ),
              );
          }
        }
      }
    });
    await this.record('route.updated', route, actor, meta, {
      stopsReplaced: Boolean(input.stops),
      droppedFares,
    });
    return this.load(route);
  }

  /** Only drafts can be deleted; published routes are deactivated instead. */
  async remove(
    access: OrganizationAccess,
    routeId: string,
    actor: Authenticated,
    meta: RequestMeta,
  ): Promise<void> {
    const route = await this.requireRoute(access, routeId);
    if (route.status !== 'draft')
      throw conflict('Deactivate published routes instead of deleting them');
    await this.database.db.delete(routes).where(eq(routes.id, route.id));
    await this.record('route.deleted', route, actor, meta);
  }

  async changeStatus(
    access: OrganizationAccess,
    routeId: string,
    status: RouteStatus,
    actor: Authenticated,
    meta: RequestMeta,
  ): Promise<Route> {
    const route = await this.requireRoute(access, routeId);
    if (!STATUS_TRANSITIONS[route.status].includes(status)) {
      throw conflict(`Cannot change a ${route.status} route to ${status}`);
    }
    if (status === 'active') {
      if (access.organization.status !== 'active') {
        throw conflict('The organization must be approved before publishing routes');
      }
      const current = await this.load(route);
      if (!current.schedules.some((s) => s.active)) {
        throw conflict('Add at least one active schedule before publishing the route');
      }
      const origin = current.stops[0]!.stop.id;
      const destination = current.stops.at(-1)!.stop.id;
      if (!current.fares.some((f) => f.fromStopId === origin && f.toStopId === destination)) {
        throw conflict('Set the fare from the origin to the final destination before publishing');
      }
    }
    // Conditional on the status read above, so two concurrent changes cannot both apply.
    const [updated] = await this.database.db
      .update(routes)
      .set({ status })
      .where(and(eq(routes.id, route.id), eq(routes.status, route.status)))
      .returning();
    if (!updated) throw conflict('The route changed, reload and retry');
    await this.record('route.status_changed', route, actor, meta, {
      from: route.status,
      to: status,
    });
    return this.load(updated);
  }

  async replaceFares(
    access: OrganizationAccess,
    routeId: string,
    fares: Fare[],
    actor: Authenticated,
    meta: RequestMeta,
  ): Promise<Route> {
    const route = await this.requireRoute(access, routeId);
    const order = new Map(
      (
        await this.database.db
          .select({ stopId: routeStops.stopId, sequence: routeStops.sequence })
          .from(routeStops)
          .where(eq(routeStops.routeId, route.id))
      ).map((s) => [s.stopId, s.sequence]),
    );
    const seen = new Set<string>();
    for (const fare of fares) {
      const from = order.get(fare.fromStopId);
      const to = order.get(fare.toStopId);
      if (from === undefined || to === undefined)
        throw invalid('Every fare must use stops of this route');
      if (from >= to) throw invalid('Fares go from a stop to a later stop of the route');
      if (Number(fare.amount) <= 0) throw invalid('Fares must be greater than zero');
      const key = `${fare.fromStopId}:${fare.toStopId}`;
      if (seen.has(key)) throw invalid('Each pair of stops can have only one fare');
      seen.add(key);
    }
    await this.database.db.transaction(async (tx) => {
      await tx.delete(routeFares).where(eq(routeFares.routeId, route.id));
      if (fares.length) {
        await tx.insert(routeFares).values(fares.map((fare) => ({ ...fare, routeId: route.id })));
      }
    });
    await this.record('route.fares_replaced', route, actor, meta, { count: fares.length });
    return this.load(route);
  }

  async addSchedule(
    access: OrganizationAccess,
    routeId: string,
    input: ScheduleInput,
    actor: Authenticated,
    meta: RequestMeta,
  ): Promise<Route> {
    const route = await this.requireRoute(access, routeId);
    assertWindow(input.validFrom, input.validUntil ?? null);
    const [{ total }] = (await this.database.db
      .select({ total: count() })
      .from(routeSchedules)
      .where(eq(routeSchedules.routeId, route.id))) as [{ total: number }];
    if (total >= MAX_SCHEDULES_PER_ROUTE) throw conflict('This route has too many schedules');
    const seating = await this.seating(access, input.seatLayoutId ?? null, input.seats);
    const [schedule] = await this.database.db
      .insert(routeSchedules)
      .values({
        routeId: route.id,
        departureTime: input.departureTime,
        daysOfWeek: normalizeDays(input.daysOfWeek),
        validFrom: input.validFrom,
        validUntil: input.validUntil ?? null,
        serviceClass: input.serviceClass,
        ...seating,
        active: input.active ?? true,
      })
      .returning();
    await this.record('route.schedule_created', route, actor, meta, { scheduleId: schedule!.id });
    return this.load(route);
  }

  async updateSchedule(
    access: OrganizationAccess,
    routeId: string,
    scheduleId: string,
    input: Partial<ScheduleInput>,
    actor: Authenticated,
    meta: RequestMeta,
  ): Promise<Route> {
    const route = await this.requireRoute(access, routeId);
    const current = await this.requireSchedule(route.id, scheduleId);
    const validFrom = input.validFrom ?? current.validFrom;
    const validUntil = input.validUntil === undefined ? current.validUntil : input.validUntil;
    assertWindow(validFrom, validUntil);
    const seating = await this.seating(
      access,
      input.seatLayoutId === undefined ? current.seatLayoutId : input.seatLayoutId,
      input.seats ?? current.seats,
    );
    await this.database.db
      .update(routeSchedules)
      .set({
        ...(input.departureTime ? { departureTime: input.departureTime } : {}),
        ...(input.daysOfWeek ? { daysOfWeek: normalizeDays(input.daysOfWeek) } : {}),
        validFrom,
        validUntil,
        ...(input.serviceClass ? { serviceClass: input.serviceClass } : {}),
        ...seating,
        ...(input.active === undefined ? {} : { active: input.active }),
      })
      .where(eq(routeSchedules.id, current.id));
    await this.record('route.schedule_updated', route, actor, meta, { scheduleId });
    return this.load(route);
  }

  async removeSchedule(
    access: OrganizationAccess,
    routeId: string,
    scheduleId: string,
    actor: Authenticated,
    meta: RequestMeta,
  ): Promise<Route> {
    const route = await this.requireRoute(access, routeId);
    const schedule = await this.requireSchedule(route.id, scheduleId);
    await this.database.db.delete(routeSchedules).where(eq(routeSchedules.id, schedule.id));
    await this.record('route.schedule_deleted', route, actor, meta, { scheduleId });
    return this.load(route);
  }

  /** With a seat layout the schedule takes its capacity; without one, `seats` is required. */
  private async seating(
    access: OrganizationAccess,
    seatLayoutId: string | null,
    seats: number | undefined,
  ): Promise<{ seatLayoutId: string | null; seats: number }> {
    if (seatLayoutId) {
      const layout = await this.fleet.require(access.organization.id, seatLayoutId);
      return { seatLayoutId: layout.id, seats: layout.capacity };
    }
    if (!seats) throw invalid('Set the number of seats or choose a seat layout');
    return { seatLayoutId: null, seats };
  }

  /** The route of this organization, or 404 (other organizations' routes are not revealed). */
  private async requireRoute(access: OrganizationAccess, routeId: string): Promise<RouteRow> {
    const [route] = await this.database.db
      .select()
      .from(routes)
      .where(and(eq(routes.id, routeId), eq(routes.organizationId, access.organization.id)));
    if (!route) throw notFound();
    return route;
  }

  private async requireSchedule(routeId: string, scheduleId: string): Promise<RouteScheduleRow> {
    const [schedule] = await this.database.db
      .select()
      .from(routeSchedules)
      .where(and(eq(routeSchedules.id, scheduleId), eq(routeSchedules.routeId, routeId)));
    if (!schedule) throw notFound('Schedule not found');
    return schedule;
  }

  /** Origin at 0 minutes, strictly increasing times, each stop once, all stops active. */
  private async assertStops(list: RouteInput['stops']): Promise<void> {
    if (list[0]!.minutesFromOrigin !== 0) throw invalid('The origin must be at 0 minutes');
    for (let i = 1; i < list.length; i++) {
      if (list[i]!.minutesFromOrigin <= list[i - 1]!.minutesFromOrigin) {
        throw invalid('Each stop must be reached after the previous one');
      }
    }
    const ids = list.map((s) => s.stopId);
    if (new Set(ids).size !== ids.length) throw invalid('A stop can appear only once in a route');
    const found = await this.database.db
      .select({ id: stops.id })
      .from(stops)
      .where(and(inArray(stops.id, ids), eq(stops.active, true)));
    if (found.length !== ids.length)
      throw invalid('Every stop must exist in the catalog and be active');
  }

  private async writeStops(tx: Transaction, routeId: string, list: RouteInput['stops']) {
    await tx.insert(routeStops).values(
      list.map((stop, sequence) => ({
        routeId,
        stopId: stop.stopId,
        sequence,
        minutesFromOrigin: stop.minutesFromOrigin,
      })),
    );
  }

  private async load(route: RouteRow): Promise<Route> {
    const [current, stopRows, fares, schedules] = await Promise.all([
      this.database.db.select().from(routes).where(eq(routes.id, route.id)),
      this.database.db
        .select({ routeStop: routeStops, stop: stops })
        .from(routeStops)
        .innerJoin(stops, eq(stops.id, routeStops.stopId))
        .where(eq(routeStops.routeId, route.id))
        .orderBy(asc(routeStops.sequence)),
      this.database.db.select().from(routeFares).where(eq(routeFares.routeId, route.id)),
      this.database.db
        .select()
        .from(routeSchedules)
        .where(eq(routeSchedules.routeId, route.id))
        .orderBy(asc(routeSchedules.departureTime), asc(routeSchedules.createdAt)),
    ]);
    const row = current[0] ?? route;
    const sequence = new Map(stopRows.map((s) => [s.stop.id, s.routeStop.sequence]));
    return {
      id: row.id,
      organizationId: row.organizationId,
      name: row.name,
      status: row.status,
      stops: stopRows.map(({ routeStop, stop }) => ({
        stop: toSummary(stop),
        sequence: routeStop.sequence,
        minutesFromOrigin: routeStop.minutesFromOrigin,
      })),
      fares: fares
        .map((fare) => ({
          fromStopId: fare.fromStopId,
          toStopId: fare.toStopId,
          amount: fare.amount,
          currency: fare.currency,
        }))
        .sort(
          (a, b) =>
            sequence.get(a.fromStopId)! - sequence.get(b.fromStopId)! ||
            sequence.get(a.toStopId)! - sequence.get(b.toStopId)!,
        ),
      schedules: schedules.map(toSchedule),
      createdAt: row.createdAt.toISOString(),
    };
  }

  private record(
    action: string,
    route: RouteRow,
    actor: Authenticated,
    meta: RequestMeta,
    metadata: Record<string, unknown> = {},
  ) {
    return this.audit.record({
      action,
      actorUserId: actor.user.id,
      targetType: 'route',
      targetId: route.id,
      ip: meta.ip,
      metadata: { organizationId: route.organizationId, ...metadata },
    });
  }
}

function normalizeDays(days: number[]): number[] {
  return [...new Set(days)].sort((a, b) => a - b);
}

function assertWindow(validFrom: string, validUntil: string | null) {
  if (!isCalendarDate(validFrom)) throw invalid('validFrom is not a valid date');
  if (validUntil !== null) {
    if (!isCalendarDate(validUntil)) throw invalid('validUntil is not a valid date');
    if (validUntil < validFrom) throw invalid('validUntil must be on or after validFrom');
  }
}

export function toSchedule(row: RouteScheduleRow): Schedule {
  return {
    id: row.id,
    departureTime: row.departureTime.slice(0, 5),
    daysOfWeek: row.daysOfWeek,
    validFrom: row.validFrom,
    validUntil: row.validUntil,
    serviceClass: row.serviceClass,
    seats: row.seats,
    seatLayoutId: row.seatLayoutId,
    active: row.active,
  };
}
