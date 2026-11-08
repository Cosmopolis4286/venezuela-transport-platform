import { HttpStatus, Injectable } from '@nestjs/common';
import {
  serviceOpen,
  type CityRef,
  type IntercitySettingsInput,
  type Service,
  type ServiceArea,
  type ServiceAreaInput,
  type ServicesSettings,
  type ServicesStatus,
} from '@vtp/shared-types';
import { and, asc, eq, inArray, ne, notInArray } from 'drizzle-orm';
import { ApiException } from '../../common/errors/api.exception.js';
import { DatabaseService } from '../../database/database.service.js';
import { AuditService } from '../audit/audit.service.js';
import type { Authenticated, RequestMeta } from '../identity/sessions.service.js';
import {
  networkSettings,
  routes,
  routeStops,
  serviceAreas,
  serviceAreaStops,
  stops,
  type ServiceAreaRow,
} from './network.schema.js';
import { toSummary } from './stops.service.js';

/** Sales checks read the switches often; a change shows up within this time on every instance. */
const CACHE_MS = 10_000;

const invalid = (message: string) =>
  new ApiException('VALIDATION_FAILED', message, HttpStatus.BAD_REQUEST);
const notFound = () => new ApiException('NOT_FOUND', 'Corridor not found', HttpStatus.NOT_FOUND);

const isUniqueViolation = (error: unknown) => {
  const cause = (error as { cause?: { code?: string } }).cause ?? error;
  return (cause as { code?: string }).code === '23505';
};

/**
 * The intercity and suburban services and their switches (ADR-029). Switching a service off only
 * stops sales (search, holds, purchases); what was sold keeps working.
 */
@Injectable()
export class ServicesService {
  private cached: { at: number; status: ServicesStatus } | null = null;

  constructor(
    private readonly database: DatabaseService,
    private readonly audit: AuditService,
  ) {}

  /** What passengers can buy now. Cached for `CACHE_MS`. */
  async status(): Promise<ServicesStatus> {
    if (this.cached && Date.now() - this.cached.at < CACHE_MS) return this.cached.status;
    const [intercity, areas] = await Promise.all([this.intercity(), this.areas()]);
    const active = areas.filter((a) => a.active);
    const status: ServicesStatus = {
      intercity,
      suburban: { enabled: active.length > 0, areas: active },
    };
    this.cached = { at: Date.now(), status };
    return status;
  }

  /** `409 SERVICE_DISABLED` unless a departure of this route between these stops is on sale. */
  async assertOpen(departure: {
    service: Service;
    serviceAreaId: string | null;
    from: CityRef;
    to: CityRef;
  }): Promise<void> {
    if (!serviceOpen(await this.status(), departure)) {
      throw ApiException.conflict('This service is not on sale right now', 'SERVICE_DISABLED');
    }
  }

  async settings(): Promise<ServicesSettings> {
    const [intercity, areas] = await Promise.all([this.intercity(), this.areas()]);
    return { intercity, areas };
  }

  /** Every corridor, on or off: operators choose one for their suburban routes. */
  areas(): Promise<ServiceArea[]> {
    return this.loadAreas();
  }

  async setIntercity(
    input: IntercitySettingsInput,
    actor: Authenticated,
    meta: RequestMeta,
  ): Promise<ServicesSettings> {
    const closedCities = dedupeCities(input.closedCities);
    if (!input.enabled) await this.assertSomethingElseOn({ keepIntercity: false });
    const values = {
      intercityEnabled: input.enabled,
      intercityClosedCities: closedCities,
      updatedByUserId: actor.user.id,
    };
    await this.database.db
      .insert(networkSettings)
      .values({ id: 1, ...values })
      .onConflictDoUpdate({
        target: networkSettings.id,
        set: { ...values, updatedAt: new Date() },
      });
    this.cached = null;
    await this.audit.record({
      action: 'services.intercity_updated',
      actorUserId: actor.user.id,
      targetType: 'network_settings',
      targetId: '1',
      ip: meta.ip,
      metadata: { enabled: input.enabled, closedCities },
    });
    return this.settings();
  }

  async createArea(
    input: ServiceAreaInput,
    actor: Authenticated,
    meta: RequestMeta,
  ): Promise<ServiceArea> {
    assertCanSwitch(actor, input.active);
    const stopIds = await this.assertStops(input.stopIds);
    const row = await this.write(() =>
      this.database.db.transaction(async (tx) => {
        const [area] = await tx
          .insert(serviceAreas)
          .values({ name: input.name.trim(), active: input.active ?? false })
          .returning();
        await tx
          .insert(serviceAreaStops)
          .values(stopIds.map((stopId) => ({ serviceAreaId: area!.id, stopId })));
        return area!;
      }),
    );
    this.cached = null;
    await this.record('service_area.created', row, actor, meta, { active: row.active });
    return this.area(row.id);
  }

  async updateArea(
    areaId: string,
    input: Partial<ServiceAreaInput>,
    actor: Authenticated,
    meta: RequestMeta,
  ): Promise<ServiceArea> {
    const current = await this.requireArea(areaId);
    assertCanSwitch(actor, input.active);
    if (input.active === false && current.active) {
      await this.assertSomethingElseOn({ keepIntercity: true, closingAreaId: areaId });
    }
    const stopIds = input.stopIds ? await this.assertStops(input.stopIds) : null;
    if (stopIds) {
      // A stop leaves the corridor only if no suburban route of the corridor stops there.
      const [used] = await this.database.db
        .select({ stopId: routeStops.stopId })
        .from(routeStops)
        .innerJoin(routes, eq(routes.id, routeStops.routeId))
        .where(and(eq(routes.serviceAreaId, areaId), notInArray(routeStops.stopId, stopIds)))
        .limit(1);
      if (used) {
        throw ApiException.conflict(
          'A suburban route of this corridor uses a stop you are removing',
          'SERVICE_AREA_STOP_IN_USE',
        );
      }
    }
    await this.write(() =>
      this.database.db.transaction(async (tx) => {
        await tx
          .update(serviceAreas)
          .set({
            ...(input.name ? { name: input.name.trim() } : {}),
            ...(input.active === undefined ? {} : { active: input.active }),
            updatedAt: new Date(),
          })
          .where(eq(serviceAreas.id, areaId));
        if (stopIds) {
          await tx.delete(serviceAreaStops).where(eq(serviceAreaStops.serviceAreaId, areaId));
          await tx
            .insert(serviceAreaStops)
            .values(stopIds.map((stopId) => ({ serviceAreaId: areaId, stopId })));
        }
        return current;
      }),
    );
    this.cached = null;
    await this.record('service_area.updated', current, actor, meta, {
      changed: Object.keys(input),
      ...(input.active === undefined ? {} : { active: input.active }),
    });
    return this.area(areaId);
  }

  /** The stops of a corridor, or 404. Used by routes to validate suburban stops. */
  async areaStopIds(areaId: string): Promise<Set<string>> {
    await this.requireArea(areaId);
    const rows = await this.database.db
      .select({ stopId: serviceAreaStops.stopId })
      .from(serviceAreaStops)
      .where(eq(serviceAreaStops.serviceAreaId, areaId));
    return new Set(rows.map((r) => r.stopId));
  }

  private async area(areaId: string): Promise<ServiceArea> {
    const [area] = await this.loadAreas(areaId);
    if (!area) throw notFound();
    return area;
  }

  private async requireArea(areaId: string): Promise<ServiceAreaRow> {
    const [row] = await this.database.db
      .select()
      .from(serviceAreas)
      .where(eq(serviceAreas.id, areaId));
    if (!row) throw notFound();
    return row;
  }

  private async loadAreas(onlyId?: string): Promise<ServiceArea[]> {
    const rows = await this.database.db
      .select()
      .from(serviceAreas)
      .where(onlyId ? eq(serviceAreas.id, onlyId) : undefined)
      .orderBy(asc(serviceAreas.name));
    if (!rows.length) return [];
    const members = await this.database.db
      .select({ areaId: serviceAreaStops.serviceAreaId, stop: stops })
      .from(serviceAreaStops)
      .innerJoin(stops, eq(stops.id, serviceAreaStops.stopId))
      .where(
        inArray(
          serviceAreaStops.serviceAreaId,
          rows.map((r) => r.id),
        ),
      )
      .orderBy(asc(stops.city), asc(stops.name));
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      active: row.active,
      stops: members.filter((m) => m.areaId === row.id).map((m) => toSummary(m.stop)),
    }));
  }

  private async intercity(): Promise<ServicesStatus['intercity']> {
    const [row] = await this.database.db.select().from(networkSettings);
    return {
      enabled: row?.intercityEnabled ?? true,
      closedCities: row?.intercityClosedCities ?? [],
    };
  }

  /** Something must stay on sale: intercity, or another active corridor. */
  private async assertSomethingElseOn(options: {
    keepIntercity: boolean;
    closingAreaId?: string;
  }): Promise<void> {
    const intercityOn = options.keepIntercity && (await this.intercity()).enabled;
    if (intercityOn) return;
    const [other] = await this.database.db
      .select({ id: serviceAreas.id })
      .from(serviceAreas)
      .where(
        and(
          eq(serviceAreas.active, true),
          options.closingAreaId ? ne(serviceAreas.id, options.closingAreaId) : undefined,
        ),
      )
      .limit(1);
    if (!other) {
      throw ApiException.conflict('At least one service must stay on', 'LAST_SERVICE_ON');
    }
  }

  private async assertStops(stopIds: string[]): Promise<string[]> {
    const ids = [...new Set(stopIds)];
    if (ids.length < 2) throw invalid('A corridor needs at least two stops');
    const found = await this.database.db
      .select({ id: stops.id })
      .from(stops)
      .where(inArray(stops.id, ids));
    if (found.length !== ids.length) throw invalid('Every stop must exist in the catalog');
    return ids;
  }

  private async write<T>(run: () => Promise<T>): Promise<T> {
    try {
      return await run();
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw ApiException.conflict(
          'There is already a corridor with that name',
          'SERVICE_AREA_NAME_TAKEN',
        );
      }
      throw error;
    }
  }

  private record(
    action: string,
    area: ServiceAreaRow,
    actor: Authenticated,
    meta: RequestMeta,
    metadata: Record<string, unknown>,
  ) {
    return this.audit.record({
      action,
      actorUserId: actor.user.id,
      targetType: 'service_area',
      targetId: area.id,
      ip: meta.ip,
      metadata,
    });
  }
}

/** Reviewers curate corridors; only platform admins switch sales on or off. */
function assertCanSwitch(actor: Authenticated, active: boolean | undefined) {
  if (active !== undefined && actor.user.platformRole !== 'admin') {
    throw new ApiException(
      'FORBIDDEN',
      'Only platform admins switch corridors on or off',
      HttpStatus.FORBIDDEN,
    );
  }
}

function dedupeCities(cities: CityRef[]): CityRef[] {
  const seen = new Set<string>();
  const result: CityRef[] = [];
  for (const city of cities) {
    const clean = { city: city.city.trim(), state: city.state.trim() };
    const key = `${clean.city.toLowerCase()}|${clean.state.toLowerCase()}`;
    if (!clean.city || !clean.state || seen.has(key)) continue;
    seen.add(key);
    result.push(clean);
  }
  return result;
}
