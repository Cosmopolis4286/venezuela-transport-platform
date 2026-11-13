import { HttpStatus, Injectable } from '@nestjs/common';
import type { NearbyStop, Stop, StopInput, StopKind, StopSummary } from '@vtp/shared-types';
import { and, asc, eq, ilike, inArray, or, sql, type SQL } from 'drizzle-orm';
import { ApiException } from '../../common/errors/api.exception.js';
import { DatabaseService } from '../../database/database.service.js';
import { AuditService } from '../audit/audit.service.js';
import type { Authenticated, RequestMeta } from '../identity/sessions.service.js';
import { OrganizationsService } from '../organizations/organizations.service.js';
import { operatingZones, stops, type StopRow } from './network.schema.js';
import { ZonesService } from './zones.service.js';

const escapeLike = (value: string) => value.replace(/[\\%_]/g, (c) => `\\${c}`);

/** Postgres unique_violation. */
const isUniqueViolation = (error: unknown) =>
  (error as { cause?: { code?: string } }).cause?.code === '23505' ||
  (error as { code?: string }).code === '23505';

@Injectable()
export class StopsService {
  constructor(
    private readonly database: DatabaseService,
    private readonly organizations: OrganizationsService,
    private readonly audit: AuditService,
    private readonly zones: ZonesService,
  ) {}

  /** Stops that sell: not assigned to a zone, or in an active one. */
  private readonly served = sql`(${stops.zoneId} is null or exists (select 1 from ${operatingZones} where ${operatingZones.id} = ${stops.zoneId} and ${operatingZones.status} = 'active'))`;

  /**
   * Refuses when any of the stops is in a zone that is not active (coming soon or paused):
   * nothing there can be booked.
   */
  async assertServed(stopIds: string[]): Promise<void> {
    if (!(await this.areServed(stopIds))) {
      throw ApiException.conflict('Service is not active in this zone', 'ZONE_NOT_ACTIVE');
    }
  }

  async areServed(stopIds: string[]): Promise<boolean> {
    if (!stopIds.length) return true;
    const [blocked] = await this.database.db
      .select({ id: stops.id })
      .from(stops)
      .where(and(inArray(stops.id, stopIds), sql`not ${this.served}`))
      .limit(1);
    return !blocked;
  }

  /** Active stops of active zones within `radiusKm` of the point, nearest first. */
  async nearby(filter: {
    latitude: number;
    longitude: number;
    radiusKm?: number;
    kind?: StopKind;
  }): Promise<NearbyStop[]> {
    const point = sql`ST_SetSRID(ST_MakePoint(${filter.longitude}, ${filter.latitude}), 4326)::geography`;
    const distance = sql<number>`ST_Distance(${stops.location}::geography, ${point})`;
    const rows = await this.database.db
      .select({ stop: stops, meters: distance })
      .from(stops)
      .where(
        and(
          eq(stops.active, true),
          this.served,
          filter.kind ? eq(stops.kind, filter.kind) : undefined,
          sql`${stops.location} is not null and ST_DWithin(${stops.location}::geography, ${point}, ${(filter.radiusKm ?? 25) * 1000})`,
        ),
      )
      .orderBy(sql`${stops.location}::geography <-> ${point}`)
      .limit(30);
    return rows.map(({ stop, meters }) => ({
      ...toStop(stop),
      distanceKm: Math.round(Number(meters) / 100) / 10,
    }));
  }

  /** Search for passengers and route editors. Platform staff can include inactive stops. */
  async search(filter: {
    q?: string;
    kind?: StopKind;
    zoneId?: string;
    includeInactive?: boolean;
  }): Promise<Stop[]> {
    const conditions: SQL[] = [];
    // Passengers only see stops that sell; staff see them all.
    if (!filter.includeInactive) conditions.push(eq(stops.active, true), this.served);
    if (filter.kind) conditions.push(eq(stops.kind, filter.kind));
    if (filter.zoneId) conditions.push(eq(stops.zoneId, filter.zoneId));
    const q = filter.q?.trim();
    if (q) {
      const pattern = `%${escapeLike(q)}%`;
      conditions.push(or(ilike(stops.name, pattern), ilike(stops.city, pattern))!);
    }
    const rows = await this.database.db
      .select()
      .from(stops)
      .where(and(...conditions))
      .orderBy(asc(stops.state), asc(stops.city), asc(stops.name))
      .limit(200);
    return rows.map(toStop);
  }

  async summaries(ids: string[]): Promise<Map<string, StopSummary>> {
    if (!ids.length) return new Map();
    const rows = await this.database.db.select().from(stops).where(inArray(stops.id, ids));
    return new Map(rows.map((row) => [row.id, toSummary(row)]));
  }

  async create(input: StopInput, actor: Authenticated, meta: RequestMeta): Promise<Stop> {
    const values = await this.values(input);
    // A new stop joins the zone whose area contains it, unless one is given.
    const zoneId =
      input.zoneId !== undefined
        ? input.zoneId
        : typeof input.latitude === 'number' && typeof input.longitude === 'number'
          ? await this.zones.zoneAt(input.latitude, input.longitude)
          : null;
    const row = await this.write(() =>
      this.database.db
        .insert(stops)
        .values({
          ...values,
          zoneId,
          kind: input.kind,
          name: input.name.trim(),
          city: input.city.trim(),
          state: input.state.trim(),
        })
        .returning(),
    );
    await this.audit.record({
      action: 'stop.created',
      actorUserId: actor.user.id,
      targetType: 'stop',
      targetId: row.id,
      ip: meta.ip,
    });
    return toStop(row);
  }

  async update(
    stopId: string,
    input: Partial<StopInput>,
    actor: Authenticated,
    meta: RequestMeta,
  ): Promise<Stop> {
    const [current] = await this.database.db.select().from(stops).where(eq(stops.id, stopId));
    if (!current) throw new ApiException('NOT_FOUND', 'Stop not found', HttpStatus.NOT_FOUND);
    // The patch is applied over the current values and the result validated as a whole.
    const merged: StopInput = { ...toStop(current), ...input };
    const values = await this.values(merged);
    const row = await this.write(() =>
      this.database.db
        .update(stops)
        .set({
          ...values,
          zoneId: merged.zoneId ?? null,
          kind: merged.kind,
          name: merged.name.trim(),
          city: merged.city.trim(),
          state: merged.state.trim(),
        })
        .where(eq(stops.id, stopId))
        .returning(),
    );
    await this.audit.record({
      action: 'stop.updated',
      actorUserId: actor.user.id,
      targetType: 'stop',
      targetId: stopId,
      ip: meta.ip,
      metadata: { fields: Object.keys(input) },
    });
    return toStop(row);
  }

  /** Columns shared by create and update, validated. */
  private async values(input: Partial<StopInput>) {
    const hasLatitude = input.latitude !== undefined && input.latitude !== null;
    const hasLongitude = input.longitude !== undefined && input.longitude !== null;
    if (hasLatitude !== hasLongitude) {
      throw new ApiException(
        'VALIDATION_FAILED',
        'Send both latitude and longitude, or neither',
        HttpStatus.BAD_REQUEST,
      );
    }
    if (input.zoneId && !(await this.zones.exists(input.zoneId))) {
      throw new ApiException('VALIDATION_FAILED', 'zoneId is not a zone', HttpStatus.BAD_REQUEST);
    }
    if (input.operatorOrganizationId) {
      const organization = await this.organizations.findById(input.operatorOrganizationId);
      if (!organization || organization.type !== 'terminal') {
        throw new ApiException(
          'VALIDATION_FAILED',
          'operatorOrganizationId must be a terminal organization',
          HttpStatus.BAD_REQUEST,
        );
      }
    }
    return {
      address: input.address?.trim() || null,
      // Written with an explicit SRID: the column is geometry(point, 4326).
      location: hasLatitude
        ? sql`ST_SetSRID(ST_MakePoint(${input.longitude}, ${input.latitude}), 4326)`
        : null,
      operatorOrganizationId: input.operatorOrganizationId ?? null,
      active: input.active ?? true,
    };
  }

  private async write(run: () => Promise<StopRow[]>): Promise<StopRow> {
    try {
      const [row] = await run();
      return row!;
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw ApiException.conflict(
          'A stop with this name already exists in this city',
          'STOP_NAME_TAKEN',
        );
      }
      throw error;
    }
  }
}

export function toSummary(row: StopRow): StopSummary {
  return { id: row.id, kind: row.kind, name: row.name, city: row.city, state: row.state };
}

export function toStop(row: StopRow): Stop {
  return {
    ...toSummary(row),
    address: row.address,
    latitude: row.location?.y ?? null,
    longitude: row.location?.x ?? null,
    operatorOrganizationId: row.operatorOrganizationId,
    active: row.active,
    zoneId: row.zoneId,
  };
}
