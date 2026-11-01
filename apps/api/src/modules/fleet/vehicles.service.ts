import { HttpStatus, Injectable } from '@nestjs/common';
import {
  normalizePlate,
  plateProblem,
  runsRoutes,
  todayInVenezuela,
  VEHICLE_DOCUMENT_KINDS,
  vehicleDocumentStatus,
  worstDocumentStatus,
  type FleetVehicle,
  type VehicleDocumentInput,
  type VehicleDocumentKind,
  type VehicleInput,
} from '@vtp/shared-types';
import { and, asc, eq, inArray } from 'drizzle-orm';
import { ApiException } from '../../common/errors/api.exception.js';
import { DatabaseService } from '../../database/database.service.js';
import { AuditService } from '../audit/audit.service.js';
import type { Authenticated, RequestMeta } from '../identity/sessions.service.js';
import type { OrganizationAccess } from '../organizations/organization-access.js';
import {
  seatLayouts,
  vehicleDocuments,
  vehicles,
  type VehicleDocumentRow,
  type VehicleRow,
} from './fleet.schema.js';
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
    const docs = rows.length
      ? await this.database.db
          .select()
          .from(vehicleDocuments)
          .where(
            inArray(
              vehicleDocuments.vehicleId,
              rows.map((r) => r.vehicle.id),
            ),
          )
      : [];
    const today = todayInVenezuela();
    return rows.map(({ vehicle, layout }) =>
      toVehicle(
        vehicle,
        layout,
        docs.filter((d) => d.vehicleId === vehicle.id),
        today,
      ),
    );
  }

  /** Saves (or replaces) one document of a vehicle with its number and last valid day. */
  async setDocument(
    access: OrganizationAccess,
    vehicleId: string,
    kind: VehicleDocumentKind,
    input: VehicleDocumentInput,
    actor: Authenticated,
    meta: RequestMeta,
  ): Promise<FleetVehicle> {
    const vehicle = await this.require(access.organization.id, vehicleId);
    const number = input.number.trim();
    if (!number) {
      throw new ApiException(
        'VALIDATION_FAILED',
        'Write the document number',
        HttpStatus.BAD_REQUEST,
      );
    }
    const values = { number, expiresOn: input.expiresOn, updatedByUserId: actor.user.id };
    await this.database.db
      .insert(vehicleDocuments)
      .values({ vehicleId, kind, ...values })
      .onConflictDoUpdate({
        target: [vehicleDocuments.vehicleId, vehicleDocuments.kind],
        set: { ...values, updatedAt: new Date() },
      });
    await this.record('vehicle.document_set', vehicle, actor, meta, {
      kind,
      expiresOn: input.expiresOn,
    });
    return this.get(access.organization.id, vehicleId);
  }

  async removeDocument(
    access: OrganizationAccess,
    vehicleId: string,
    kind: VehicleDocumentKind,
    actor: Authenticated,
    meta: RequestMeta,
  ): Promise<FleetVehicle> {
    const vehicle = await this.require(access.organization.id, vehicleId);
    await this.database.db
      .delete(vehicleDocuments)
      .where(and(eq(vehicleDocuments.vehicleId, vehicleId), eq(vehicleDocuments.kind, kind)));
    await this.record('vehicle.document_removed', vehicle, actor, meta, { kind });
    return this.get(access.organization.id, vehicleId);
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

function toVehicle(
  row: VehicleRow,
  layout: FleetVehicle['seatLayout'],
  docs: VehicleDocumentRow[],
  today: string,
): FleetVehicle {
  const documents = docs
    .map((d) => ({
      kind: d.kind,
      number: d.number,
      expiresOn: d.expiresOn,
      status: vehicleDocumentStatus(d.expiresOn, today),
    }))
    .sort(
      (a, b) => VEHICLE_DOCUMENT_KINDS.indexOf(a.kind) - VEHICLE_DOCUMENT_KINDS.indexOf(b.kind),
    );
  return {
    id: row.id,
    organizationId: row.organizationId,
    plate: row.plate,
    label: row.label,
    seatLayout: layout,
    active: row.active,
    documents,
    documentAlert: worstDocumentStatus(documents.map((d) => d.status)),
    createdAt: row.createdAt.toISOString(),
  };
}
