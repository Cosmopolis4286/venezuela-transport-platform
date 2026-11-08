import { HttpStatus, Injectable } from '@nestjs/common';
import type { OperatingZone, OperatingZoneInput } from '@vtp/shared-types';
import { asc, count, eq, inArray, sql } from 'drizzle-orm';
import { ApiException } from '../../common/errors/api.exception.js';
import { DatabaseService } from '../../database/database.service.js';
import { AuditService } from '../audit/audit.service.js';
import type { Authenticated, RequestMeta } from '../identity/sessions.service.js';
import { operatingZones, stops, type OperatingZoneRow } from './network.schema.js';

const isUniqueViolation = (error: unknown) =>
  (error as { cause?: { code?: string } }).cause?.code === '23505' ||
  (error as { code?: string }).code === '23505';

/**
 * Operating zones (ADR-028): which cities sell, with what default currency and commission.
 * Turning a zone on or off is one PATCH of `status`; nothing else changes.
 */
@Injectable()
export class ZonesService {
  constructor(
    private readonly database: DatabaseService,
    private readonly audit: AuditService,
  ) {}

  /** Public: active and coming-soon zones. Admin: every zone, with its number of stops. */
  async list(admin = false): Promise<OperatingZone[]> {
    const rows = await this.database.db
      .select()
      .from(operatingZones)
      .where(admin ? undefined : inArray(operatingZones.status, ['active', 'coming_soon']))
      .orderBy(asc(operatingZones.name));
    if (!admin) return rows.map((row) => toZone(row));
    const counts = await this.database.db
      .select({ zoneId: stops.zoneId, n: count() })
      .from(stops)
      .groupBy(stops.zoneId);
    const byZone = new Map(counts.map((c) => [c.zoneId, c.n]));
    return rows.map((row) => toZone(row, byZone.get(row.id) ?? 0));
  }

  async exists(zoneId: string): Promise<boolean> {
    const [row] = await this.database.db
      .select({ id: operatingZones.id })
      .from(operatingZones)
      .where(eq(operatingZones.id, zoneId));
    return Boolean(row);
  }

  /** The zone whose area contains the point (the nearest centre if several do), if any. */
  async zoneAt(latitude: number, longitude: number): Promise<string | null> {
    const point = sql`ST_SetSRID(ST_MakePoint(${longitude}, ${latitude}), 4326)::geography`;
    const [row] = await this.database.db
      .select({ id: operatingZones.id })
      .from(operatingZones)
      .where(
        sql`${operatingZones.center} is not null and ST_DWithin(${operatingZones.center}::geography, ${point}, ${operatingZones.radiusKm} * 1000)`,
      )
      .orderBy(sql`${operatingZones.center}::geography <-> ${point}`)
      .limit(1);
    return row?.id ?? null;
  }

  async create(input: OperatingZoneInput, actor: Authenticated, meta: RequestMeta) {
    const row = await this.write(() =>
      this.database.db
        .insert(operatingZones)
        .values({ ...values(input), name: input.name.trim(), slug: input.slug })
        .returning(),
    );
    await this.record('zone.created', row.id, actor, meta, { status: row.status });
    return toZone(row, 0);
  }

  async update(
    zoneId: string,
    input: Partial<OperatingZoneInput>,
    actor: Authenticated,
    meta: RequestMeta,
  ): Promise<OperatingZone> {
    const [current] = await this.database.db
      .select()
      .from(operatingZones)
      .where(eq(operatingZones.id, zoneId));
    if (!current) throw new ApiException('NOT_FOUND', 'Zone not found', HttpStatus.NOT_FOUND);
    const merged: OperatingZoneInput = { ...toZone(current), ...input };
    const row = await this.write(() =>
      this.database.db
        .update(operatingZones)
        .set({
          ...values(merged),
          name: merged.name.trim(),
          slug: merged.slug,
          updatedAt: new Date(),
        })
        .where(eq(operatingZones.id, zoneId))
        .returning(),
    );
    await this.record('zone.updated', zoneId, actor, meta, {
      fields: Object.keys(input),
      status: row.status,
    });
    const [{ n }] = (await this.database.db
      .select({ n: count() })
      .from(stops)
      .where(eq(stops.zoneId, zoneId))) as [{ n: number }];
    return toZone(row, n);
  }

  private record(
    action: string,
    zoneId: string,
    actor: Authenticated,
    meta: RequestMeta,
    metadata: Record<string, unknown>,
  ) {
    return this.audit.record({
      action,
      actorUserId: actor.user.id,
      targetType: 'zone',
      targetId: zoneId,
      ip: meta.ip,
      metadata,
    });
  }

  private async write(run: () => Promise<OperatingZoneRow[]>): Promise<OperatingZoneRow> {
    try {
      const [row] = await run();
      return row!;
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw ApiException.conflict(
          'A zone with this name or slug already exists',
          'ZONE_NAME_TAKEN',
        );
      }
      throw error;
    }
  }
}

const given = (value: number | null | undefined): value is number => typeof value === 'number';

function values(input: Partial<OperatingZoneInput>) {
  const hasCenter = given(input.latitude) && given(input.longitude);
  if (given(input.latitude) !== given(input.longitude) || hasCenter !== given(input.radiusKm)) {
    throw new ApiException(
      'VALIDATION_FAILED',
      'Send latitude, longitude and radiusKm together, or none of them',
      HttpStatus.BAD_REQUEST,
    );
  }
  return {
    status: input.status ?? 'coming_soon',
    defaultCurrency: input.defaultCurrency ?? 'USD',
    commissionRate: input.commissionRate ?? null,
    center: hasCenter
      ? sql`ST_SetSRID(ST_MakePoint(${input.longitude}, ${input.latitude}), 4326)`
      : null,
    radiusKm: hasCenter ? input.radiusKm! : null,
  };
}

export function toZone(row: OperatingZoneRow, stopCount?: number): OperatingZone {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    status: row.status,
    defaultCurrency: row.defaultCurrency,
    commissionRate: row.commissionRate,
    latitude: row.center?.y ?? null,
    longitude: row.center?.x ?? null,
    radiusKm: row.radiusKm,
    ...(stopCount === undefined ? {} : { stopCount }),
  };
}
