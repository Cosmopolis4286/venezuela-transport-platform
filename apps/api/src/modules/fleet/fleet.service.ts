import { HttpStatus, Injectable } from '@nestjs/common';
import {
  layoutProblem,
  runsRoutes,
  type SeatLayout,
  type SeatLayoutInput,
} from '@vtp/shared-types';
import { and, asc, count, eq, inArray } from 'drizzle-orm';
import { ApiException } from '../../common/errors/api.exception.js';
import { DatabaseService } from '../../database/database.service.js';
import { AuditService } from '../audit/audit.service.js';
import type { Authenticated, RequestMeta } from '../identity/sessions.service.js';
import { routeSchedules } from '../network/network.schema.js';
import type { OrganizationAccess } from '../organizations/organization-access.js';
import { seatLayouts, type SeatLayoutRow } from './fleet.schema.js';

const notFound = () => new ApiException('NOT_FOUND', 'Seat layout not found', HttpStatus.NOT_FOUND);

@Injectable()
export class FleetService {
  constructor(
    private readonly database: DatabaseService,
    private readonly audit: AuditService,
  ) {}

  async list(organizationId: string): Promise<SeatLayout[]> {
    const rows = await this.database.db
      .select()
      .from(seatLayouts)
      .where(eq(seatLayouts.organizationId, organizationId))
      .orderBy(asc(seatLayouts.name));
    return this.withUsage(rows);
  }

  async get(access: OrganizationAccess, layoutId: string): Promise<SeatLayout> {
    const [layout] = await this.withUsage([await this.require(access.organization.id, layoutId)]);
    return layout!;
  }

  async create(
    access: OrganizationAccess,
    input: SeatLayoutInput,
    actor: Authenticated,
    meta: RequestMeta,
  ): Promise<SeatLayout> {
    if (!runsRoutes(access.organization.type)) {
      throw new ApiException(
        'CONFLICT',
        'Only bus companies and taxi lines have seat layouts',
        HttpStatus.CONFLICT,
      );
    }
    assertValid(input);
    const [row] = await this.database.db
      .insert(seatLayouts)
      .values({ ...normalize(input), organizationId: access.organization.id })
      .returning();
    await this.record('seat_layout.created', row!, actor, meta);
    return (await this.withUsage([row!]))[0]!;
  }

  /** Editing a layout also updates the seat count of the schedules that use it. */
  async update(
    access: OrganizationAccess,
    layoutId: string,
    input: Partial<SeatLayoutInput>,
    actor: Authenticated,
    meta: RequestMeta,
  ): Promise<SeatLayout> {
    const current = await this.require(access.organization.id, layoutId);
    const merged = { ...current, ...input };
    assertValid(merged);
    const values = normalize(merged);
    const row = await this.database.db.transaction(async (tx) => {
      const [updated] = await tx
        .update(seatLayouts)
        .set(values)
        .where(eq(seatLayouts.id, layoutId))
        .returning();
      await tx
        .update(routeSchedules)
        .set({ seats: values.capacity })
        .where(eq(routeSchedules.seatLayoutId, layoutId));
      return updated!;
    });
    await this.record('seat_layout.updated', row, actor, meta, { capacity: values.capacity });
    return (await this.withUsage([row]))[0]!;
  }

  async remove(
    access: OrganizationAccess,
    layoutId: string,
    actor: Authenticated,
    meta: RequestMeta,
  ): Promise<void> {
    const layout = await this.require(access.organization.id, layoutId);
    const [usage] = await this.withUsage([layout]);
    if (usage!.scheduleCount > 0) {
      throw new ApiException(
        'CONFLICT',
        'Assign another layout to its schedules before deleting it',
        HttpStatus.CONFLICT,
      );
    }
    await this.database.db.delete(seatLayouts).where(eq(seatLayouts.id, layoutId));
    await this.record('seat_layout.deleted', layout, actor, meta);
  }

  /** The organization's layout, or 404. Used by schedules. */
  async require(organizationId: string, layoutId: string): Promise<SeatLayoutRow> {
    const [layout] = await this.database.db
      .select()
      .from(seatLayouts)
      .where(and(eq(seatLayouts.id, layoutId), eq(seatLayouts.organizationId, organizationId)));
    if (!layout) throw notFound();
    return layout;
  }

  private async withUsage(rows: SeatLayoutRow[]): Promise<SeatLayout[]> {
    if (!rows.length) return [];
    const usage = await this.database.db
      .select({ layoutId: routeSchedules.seatLayoutId, total: count() })
      .from(routeSchedules)
      .where(
        inArray(
          routeSchedules.seatLayoutId,
          rows.map((r) => r.id),
        ),
      )
      .groupBy(routeSchedules.seatLayoutId);
    return rows.map((row) => ({
      id: row.id,
      organizationId: row.organizationId,
      name: row.name,
      decks: row.decks,
      rows: row.rows,
      columns: row.columns,
      seats: row.seats,
      capacity: row.capacity,
      scheduleCount: usage.find((u) => u.layoutId === row.id)?.total ?? 0,
      createdAt: row.createdAt.toISOString(),
    }));
  }

  private record(
    action: string,
    layout: SeatLayoutRow,
    actor: Authenticated,
    meta: RequestMeta,
    metadata: Record<string, unknown> = {},
  ) {
    return this.audit.record({
      action,
      actorUserId: actor.user.id,
      targetType: 'seat_layout',
      targetId: layout.id,
      ip: meta.ip,
      metadata: { organizationId: layout.organizationId, ...metadata },
    });
  }
}

function assertValid(layout: SeatLayoutInput) {
  const problem = layoutProblem(layout);
  if (problem) throw new ApiException('VALIDATION_FAILED', problem, HttpStatus.BAD_REQUEST);
}

function normalize(layout: SeatLayoutInput) {
  const seats = [...layout.seats]
    .map((s) => ({ number: s.number.toUpperCase(), deck: s.deck, row: s.row, column: s.column }))
    .sort((a, b) => a.deck - b.deck || a.row - b.row || a.column - b.column);
  return {
    name: layout.name.trim(),
    decks: layout.decks,
    rows: layout.rows,
    columns: layout.columns,
    seats,
    capacity: seats.length,
  };
}
