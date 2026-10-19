import { HttpStatus, Injectable } from '@nestjs/common';
import type { Stop, StopInput, StopKind, StopSummary } from '@vtp/shared-types';
import { and, asc, eq, ilike, inArray, or, sql, type SQL } from 'drizzle-orm';
import { ApiException } from '../../common/errors/api.exception.js';
import { DatabaseService } from '../../database/database.service.js';
import { AuditService } from '../audit/audit.service.js';
import type { Authenticated, RequestMeta } from '../identity/sessions.service.js';
import { OrganizationsService } from '../organizations/organizations.service.js';
import { stops, type StopRow } from './network.schema.js';

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
  ) {}

  /** Search for passengers and route editors. Platform staff can include inactive stops. */
  async search(filter: {
    q?: string;
    kind?: StopKind;
    includeInactive?: boolean;
  }): Promise<Stop[]> {
    const conditions: SQL[] = [];
    if (!filter.includeInactive) conditions.push(eq(stops.active, true));
    if (filter.kind) conditions.push(eq(stops.kind, filter.kind));
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
    const row = await this.write(() =>
      this.database.db
        .insert(stops)
        .values({
          ...values,
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
        throw new ApiException(
          'CONFLICT',
          'A stop with this name already exists in this city',
          HttpStatus.CONFLICT,
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
  };
}
