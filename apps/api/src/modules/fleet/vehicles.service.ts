import { HttpStatus, Injectable } from '@nestjs/common';
import {
  normalizePlate,
  plateProblem,
  runsRoutes,
  type FleetVehicle,
  type VehicleInput,
} from '@vtp/shared-types';
import { and, asc, eq } from 'drizzle-orm';
import { ApiException } from '../../common/errors/api.exception.js';
import { DatabaseService } from '../../database/database.service.js';
import { AuditService } from '../audit/audit.service.js';
import type { Authenticated, RequestMeta } from '../identity/sessions.service.js';
import type { OrganizationAccess } from '../organizations/organization-access.js';
import { seatLayouts, vehicles, type VehicleRow } from './fleet.schema.js';
import { FleetService } from './fleet.service.js';

const notFound = () => new ApiException('NOT_FOUND', 'Vehicle not found', HttpStatus.NOT_FOUND);

const isUniqueViolation = (error: unknown) => {
  const cause = (error as { cause?: { code?: string } }).cause ?? error;
  return (cause as { code?: string }).code === '23505';
};

@Injectable()
export class VehiclesService {
  constructor(
    private readonly database: DatabaseService,
    private readonly audit: AuditService,
    private readonly layouts: FleetService,
  ) {}

  async list(organizationId: string): Promise<FleetVehicle[]> {
    const rows = await this.database.db
      .select({ vehicle: vehicles, layout: layoutColumns })
      .from(vehicles)
      .leftJoin(seatLayouts, eq(seatLayouts.id, vehicles.seatLayoutId))
      .where(eq(vehicles.organizationId, organizationId))
      .orderBy(asc(vehicles.plate));
    return rows.map(({ vehicle, layout }) => toVehicle(vehicle, layout));
  }

  async create(
    access: OrganizationAccess,
    input: VehicleInput,
    actor: Authenticated,
    meta: RequestMeta,
  ): Promise<FleetVehicle> {
    if (!runsRoutes(access.organization.type)) {
      throw new ApiException(
        'CONFLICT',
        'Only bus companies and taxi lines have vehicles',
        HttpStatus.CONFLICT,
      );
    }
    const values = await this.values(access.organization.id, input);
    const row = await this.save(() =>
      this.database.db
        .insert(vehicles)
        .values({ plate: values.plate!, ...values, organizationId: access.organization.id })
        .returning(),
    );
    await this.record('vehicle.created', row, actor, meta);
    return this.get(access.organization.id, row.id);
  }

  async update(
    access: OrganizationAccess,
    vehicleId: string,
    input: Partial<VehicleInput>,
    actor: Authenticated,
    meta: RequestMeta,
  ): Promise<FleetVehicle> {
    await this.require(access.organization.id, vehicleId);
    const values = await this.values(access.organization.id, input);
    const row = await this.save(() =>
      this.database.db
        .update(vehicles)
        .set({ ...values, updatedAt: new Date() })
        .where(eq(vehicles.id, vehicleId))
        .returning(),
    );
    await this.record('vehicle.updated', row, actor, meta, { changed: Object.keys(values) });
    return this.get(access.organization.id, row.id);
  }

  /** The organization's vehicle, or 404. Used by dispatch. */
  async require(organizationId: string, vehicleId: string): Promise<VehicleRow> {
    const [vehicle] = await this.database.db
      .select()
      .from(vehicles)
      .where(and(eq(vehicles.id, vehicleId), eq(vehicles.organizationId, organizationId)));
    if (!vehicle) throw notFound();
    return vehicle;
  }

  private async get(organizationId: string, vehicleId: string): Promise<FleetVehicle> {
    const vehicle = (await this.list(organizationId)).find((v) => v.id === vehicleId);
    if (!vehicle) throw notFound();
    return vehicle;
  }

  /** Validated column values for the fields present in `input`. */
  private async values(organizationId: string, input: Partial<VehicleInput>) {
    const values: Partial<Pick<VehicleRow, 'plate' | 'label' | 'seatLayoutId' | 'active'>> = {};
    if (input.plate !== undefined) {
      const problem = plateProblem(input.plate);
      if (problem) throw new ApiException('VALIDATION_FAILED', problem, HttpStatus.BAD_REQUEST);
      values.plate = normalizePlate(input.plate);
    }
    if (input.label !== undefined) values.label = input.label?.trim() || null;
    if (input.seatLayoutId !== undefined) {
      if (input.seatLayoutId) await this.layouts.require(organizationId, input.seatLayoutId);
      values.seatLayoutId = input.seatLayoutId;
    }
    if (input.active !== undefined) values.active = input.active;
    return values;
  }

  private async save(write: () => Promise<VehicleRow[]>): Promise<VehicleRow> {
    try {
      const [row] = await write();
      return row!;
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw ApiException.conflict(
          'Another vehicle already has this plate',
          'VEHICLE_PLATE_TAKEN',
        );
      }
      throw error;
    }
  }

  private record(
    action: string,
    vehicle: VehicleRow,
    actor: Authenticated,
    meta: RequestMeta,
    metadata: Record<string, unknown> = {},
  ) {
    return this.audit.record({
      action,
      actorUserId: actor.user.id,
      targetType: 'vehicle',
      targetId: vehicle.id,
      ip: meta.ip,
      metadata: { organizationId: vehicle.organizationId, ...metadata },
    });
  }
}

const layoutColumns = {
  id: seatLayouts.id,
  name: seatLayouts.name,
  capacity: seatLayouts.capacity,
};

function toVehicle(row: VehicleRow, layout: FleetVehicle['seatLayout']): FleetVehicle {
  return {
    id: row.id,
    organizationId: row.organizationId,
    plate: row.plate,
    label: row.label,
    seatLayout: layout,
    active: row.active,
    createdAt: row.createdAt.toISOString(),
  };
}
