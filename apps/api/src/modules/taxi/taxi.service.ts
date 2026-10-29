import { HttpStatus, Injectable } from '@nestjs/common';
import {
  ORGANIZATION_ROLES,
  roleHasPermission,
  TAXI_REQUEST_MINUTES,
  type AcceptTaxiRideRequest,
  type DriverTaxiBoard,
  type OperatorTaxiRide,
  type RequestTaxiRequest,
  type StopSummary,
  type TaxiDispatchBoard,
  type TaxiRequest,
  type TaxiRide,
  type TaxiTerminal,
} from '@vtp/shared-types';
import { and, asc, count, desc, eq, gt, inArray, lte, ne, or } from 'drizzle-orm';
import { ApiException } from '../../common/errors/api.exception.js';
import { DatabaseService, type Database } from '../../database/database.service.js';
import { AuditService } from '../audit/audit.service.js';
import { vehicles } from '../fleet/fleet.schema.js';
import { VehiclesService } from '../fleet/vehicles.service.js';
import { normalizePhone } from '../identity/contact.js';
import { users } from '../identity/identity.schema.js';
import type { Authenticated, RequestMeta } from '../identity/sessions.service.js';
import { stops } from '../network/network.schema.js';
import { StopsService } from '../network/stops.service.js';
import type { OrganizationAccess } from '../organizations/organization-access.js';
import {
  memberships,
  organizations,
  type OrganizationRow,
} from '../organizations/organizations.schema.js';
import { taxiRides, taxiServiceAreas, type TaxiRideRow } from './taxi.schema.js';

const DRIVING_ROLES = ORGANIZATION_ROLES.filter((role) => roleHasPermission(role, 'trips.drive'));
const ACTIVE = ['accepted', 'in_progress'] as const;
const MINUTE_MS = 60_000;
/** Finished rides stay on the dispatcher's board for this long. */
const RECENT_MS = 24 * 3600_000;

const conflict = (message: string) => new ApiException('CONFLICT', message, HttpStatus.CONFLICT);
const invalid = (message: string) =>
  new ApiException('VALIDATION_FAILED', message, HttpStatus.BAD_REQUEST);
const notFound = () => new ApiException('NOT_FOUND', 'Taxi ride not found', HttpStatus.NOT_FOUND);

const violated = (error: unknown): string | undefined => {
  const cause = ((error as { cause?: unknown }).cause ?? error) as {
    code?: string;
    constraint?: string;
  };
  return cause.code === '23505' ? (cause.constraint ?? 'unique') : undefined;
};

/** Requests nobody took in time; run before reading or taking requests. */
export async function expireTaxiRequests(db: Database, now = new Date()) {
  await db
    .update(taxiRides)
    .set({ status: 'expired' })
    .where(and(eq(taxiRides.status, 'requested'), lte(taxiRides.expiresAt, now)));
}

type Fare = Pick<AcceptTaxiRideRequest, 'vehicleId' | 'fareAmount' | 'fareCurrency'>;

@Injectable()
export class TaxiService {
  constructor(
    private readonly database: DatabaseService,
    private readonly audit: AuditService,
    private readonly stops: StopsService,
    private readonly vehicles: VehiclesService,
  ) {}

  // --- Passengers -------------------------------------------------------------------------

  /** Active terminals served by at least one active taxi line. */
  async terminals(): Promise<TaxiTerminal[]> {
    const rows = await this.database.db
      .select({ stopId: taxiServiceAreas.stopId, lines: count() })
      .from(taxiServiceAreas)
      .innerJoin(
        organizations,
        and(
          eq(organizations.id, taxiServiceAreas.organizationId),
          eq(organizations.type, 'taxi_line'),
          eq(organizations.status, 'active'),
        ),
      )
      .innerJoin(stops, and(eq(stops.id, taxiServiceAreas.stopId), eq(stops.active, true)))
      .groupBy(taxiServiceAreas.stopId);
    const summaries = await this.stops.summaries(rows.map((r) => r.stopId));
    return rows
      .map((r) => ({ ...summaries.get(r.stopId)!, lines: r.lines }))
      .sort((a, b) => a.name.localeCompare(b.name, 'es'));
  }

  async request(
    auth: Authenticated,
    input: RequestTaxiRequest,
    meta: RequestMeta,
  ): Promise<TaxiRide> {
    const terminal = (await this.terminals()).find((t) => t.id === input.terminalStopId);
    if (!terminal) throw conflict('No taxi line serves this terminal');
    const address = input.address.trim();
    if (address.length < 5) throw invalid('Describe the address in at least 5 characters');
    let contactPhone: string | null = auth.user.phoneVerifiedAt ? auth.user.phone : null;
    if (input.contactPhone?.trim()) {
      contactPhone = normalizePhone(input.contactPhone);
      if (!contactPhone) throw invalid('Enter a valid phone number');
    }
    await expireTaxiRequests(this.database.db);
    let row: TaxiRideRow;
    try {
      [row] = (await this.database.db
        .insert(taxiRides)
        .values({
          passengerUserId: auth.user.id,
          terminalStopId: terminal.id,
          direction: input.direction,
          address,
          notes: input.notes?.trim() || null,
          passengers: input.passengers,
          contactPhone,
          expiresAt: new Date(Date.now() + TAXI_REQUEST_MINUTES * MINUTE_MS),
        })
        .returning()) as [TaxiRideRow];
    } catch (error) {
      if (violated(error) === 'taxi_rides_passenger_open_key') {
        throw conflict('You already have a taxi ride in progress');
      }
      throw error;
    }
    await this.record('taxi_ride.requested', row, auth, meta);
    return (await this.toRides([row]))[0]!;
  }

  async listMine(userId: string): Promise<TaxiRide[]> {
    await expireTaxiRequests(this.database.db);
    const rows = await this.database.db
      .select()
      .from(taxiRides)
      .where(eq(taxiRides.passengerUserId, userId))
      .orderBy(desc(taxiRides.createdAt))
      .limit(20);
    return this.toRides(rows);
  }

  async getMine(userId: string, rideId: string): Promise<TaxiRide> {
    return (await this.toRides([await this.requireMine(userId, rideId)]))[0]!;
  }

  /** Before pickup only; afterwards the ride is between the passenger and the driver. */
  async cancelMine(auth: Authenticated, rideId: string, meta: RequestMeta): Promise<TaxiRide> {
    const ride = await this.requireMine(auth.user.id, rideId);
    const [row] = await this.database.db
      .update(taxiRides)
      .set({ status: 'cancelled', cancelledAt: new Date() })
      .where(and(eq(taxiRides.id, ride.id), inArray(taxiRides.status, ['requested', 'accepted'])))
      .returning();
    if (!row) throw conflict('This ride can no longer be cancelled');
    await this.record('taxi_ride.cancelled', row, auth, meta);
    return (await this.toRides([row]))[0]!;
  }

  // --- Drivers ----------------------------------------------------------------------------

  async driverBoard(userId: string): Promise<DriverTaxiBoard> {
    await expireTaxiRequests(this.database.db);
    const lines = await this.driverLines(userId);
    const lineIds = lines.map((l) => l.id);
    const fleet = await Promise.all(lineIds.map((id) => this.vehicles.list(id)));
    const [current] = await this.database.db
      .select()
      .from(taxiRides)
      .where(and(eq(taxiRides.driverUserId, userId), inArray(taxiRides.status, ACTIVE)));
    const requests = lineIds.length ? await this.openRequests(lineIds, userId) : [];
    return {
      current: current ? ((await this.toOperatorRides([current]))[0] ?? null) : null,
      requests,
      lines: lines.map((line, i) => ({
        organization: { id: line.id, legalName: line.legalName, tradeName: line.tradeName },
        vehicles: fleet[i]!.filter((v) => v.active).map((v) => ({
          id: v.id,
          plate: v.plate,
          label: v.label,
        })),
      })),
    };
  }

  async accept(
    auth: Authenticated,
    rideId: string,
    input: AcceptTaxiRideRequest,
    meta: RequestMeta,
  ): Promise<OperatorTaxiRide> {
    const line = (await this.driverLines(auth.user.id)).find((l) => l.id === input.organizationId);
    if (!line) throw notFound();
    return this.take(rideId, line, auth.user.id, input, auth, meta);
  }

  /** `pickup`: accepted → in_progress; `complete`: in_progress → completed; `release`: back to requested. */
  async driverStep(
    auth: Authenticated,
    rideId: string,
    step: 'pickup' | 'complete' | 'release',
    meta: RequestMeta,
  ): Promise<OperatorTaxiRide | null> {
    const [ride] = await this.database.db
      .select()
      .from(taxiRides)
      .where(and(eq(taxiRides.id, rideId), eq(taxiRides.driverUserId, auth.user.id)));
    if (!ride) throw notFound();
    if (step === 'release') {
      await this.releaseRide(ride, auth, meta);
      return null;
    }
    const now = new Date();
    const [row] = await this.database.db
      .update(taxiRides)
      .set(
        step === 'pickup'
          ? { status: 'in_progress', pickedUpAt: now }
          : { status: 'completed', completedAt: now },
      )
      .where(
        and(
          eq(taxiRides.id, ride.id),
          eq(taxiRides.status, step === 'pickup' ? 'accepted' : 'in_progress'),
        ),
      )
      .returning();
    if (!row) {
      throw conflict(
        step === 'pickup' ? 'This ride is not waiting for pickup' : 'This ride is not in progress',
      );
    }
    await this.record(
      step === 'pickup' ? 'taxi_ride.picked_up' : 'taxi_ride.completed',
      row,
      auth,
      meta,
    );
    return (await this.toOperatorRides([row]))[0]!;
  }

  // --- Dispatchers ------------------------------------------------------------------------

  async dispatchBoard(access: OrganizationAccess): Promise<TaxiDispatchBoard> {
    const organizationId = assertTaxiLine(access.organization).id;
    await expireTaxiRequests(this.database.db);
    const [terminalIds, requests, rides, drivers, fleet] = await Promise.all([
      this.terminalIdsOf(organizationId),
      this.openRequests([organizationId]),
      this.database.db
        .select()
        .from(taxiRides)
        .where(
          and(
            eq(taxiRides.organizationId, organizationId),
            or(
              inArray(taxiRides.status, ACTIVE),
              gt(taxiRides.updatedAt, new Date(Date.now() - RECENT_MS)),
            ),
          ),
        )
        .orderBy(desc(taxiRides.acceptedAt))
        .limit(100),
      this.drivers(organizationId),
      this.vehicles.list(organizationId),
    ]);
    const active = rides.filter((r) => (ACTIVE as readonly string[]).includes(r.status));
    const terminals = await this.stops.summaries(terminalIds);
    return {
      terminals: terminalIds.map((id) => terminals.get(id)!).sort(byName),
      requests,
      rides: await this.toOperatorRides(rides),
      drivers: drivers.map((d) => ({
        ...d,
        busy: active.some((r) => r.driverUserId === d.userId),
      })),
      vehicles: fleet
        .filter((v) => v.active)
        .map((v) => ({
          id: v.id,
          plate: v.plate,
          label: v.label,
          busy: active.some((r) => r.vehicleId === v.id),
        })),
    };
  }

  async assign(
    access: OrganizationAccess,
    rideId: string,
    input: Fare & { driverUserId: string },
    actor: Authenticated,
    meta: RequestMeta,
  ): Promise<OperatorTaxiRide> {
    const line = assertTaxiLine(access.organization);
    if (!(await this.drivers(line.id)).some((d) => d.userId === input.driverUserId)) {
      throw invalid('The driver must be a member whose role drives');
    }
    return this.take(rideId, line, input.driverUserId, input, actor, meta);
  }

  async release(
    access: OrganizationAccess,
    rideId: string,
    actor: Authenticated,
    meta: RequestMeta,
  ): Promise<void> {
    const [ride] = await this.database.db
      .select()
      .from(taxiRides)
      .where(and(eq(taxiRides.id, rideId), eq(taxiRides.organizationId, access.organization.id)));
    if (!ride) throw notFound();
    await this.releaseRide(ride, actor, meta);
  }

  async terminalsOf(access: OrganizationAccess): Promise<StopSummary[]> {
    const ids = await this.terminalIdsOf(assertTaxiLine(access.organization).id);
    const summaries = await this.stops.summaries(ids);
    return ids.map((id) => summaries.get(id)!).sort(byName);
  }

  async replaceTerminals(
    access: OrganizationAccess,
    stopIds: string[],
    actor: Authenticated,
    meta: RequestMeta,
  ): Promise<StopSummary[]> {
    const organizationId = assertTaxiLine(access.organization).id;
    const ids = [...new Set(stopIds)];
    const found = ids.length
      ? await this.database.db
          .select({ id: stops.id })
          .from(stops)
          .where(and(inArray(stops.id, ids), eq(stops.kind, 'terminal'), eq(stops.active, true)))
      : [];
    if (found.length !== ids.length) throw invalid('Choose active terminals');
    await this.database.db.transaction(async (tx) => {
      await tx.delete(taxiServiceAreas).where(eq(taxiServiceAreas.organizationId, organizationId));
      if (ids.length) {
        await tx.insert(taxiServiceAreas).values(ids.map((stopId) => ({ organizationId, stopId })));
      }
    });
    await this.audit.record({
      action: 'taxi_terminals.replaced',
      actorUserId: actor.user.id,
      targetType: 'organization',
      targetId: organizationId,
      ip: meta.ip,
      metadata: { stopIds: ids },
    });
    return this.terminalsOf(access);
  }

  // --- Shared -----------------------------------------------------------------------------

  /** Takes an open request for `line`, atomically: the first driver or dispatcher wins. */
  private async take(
    rideId: string,
    line: OrganizationRow,
    driverUserId: string,
    input: Fare,
    actor: Authenticated,
    meta: RequestMeta,
  ): Promise<OperatorTaxiRide> {
    if (line.status !== 'active') throw conflict('The taxi line is not active');
    if (Number(input.fareAmount) <= 0) throw invalid('The fare must be greater than zero');
    const vehicle = await this.vehicles.require(line.id, input.vehicleId);
    if (!vehicle.active) throw conflict('This vehicle is inactive');
    await expireTaxiRequests(this.database.db);
    let row: TaxiRideRow | undefined;
    try {
      [row] = await this.database.db
        .update(taxiRides)
        .set({
          status: 'accepted',
          organizationId: line.id,
          driverUserId,
          vehicleId: vehicle.id,
          fareAmount: input.fareAmount,
          fareCurrency: input.fareCurrency,
          acceptedAt: new Date(),
        })
        .where(
          and(
            eq(taxiRides.id, rideId),
            eq(taxiRides.status, 'requested'),
            ne(taxiRides.passengerUserId, driverUserId),
            inArray(
              taxiRides.terminalStopId,
              this.database.db
                .select({ stopId: taxiServiceAreas.stopId })
                .from(taxiServiceAreas)
                .where(eq(taxiServiceAreas.organizationId, line.id)),
            ),
          ),
        )
        .returning();
    } catch (error) {
      const constraint = violated(error);
      if (constraint === 'taxi_rides_driver_active_key') {
        throw conflict('This driver is already on a ride');
      }
      if (constraint === 'taxi_rides_vehicle_active_key') {
        throw conflict('This vehicle is already on a ride');
      }
      throw error;
    }
    if (!row) {
      const [ride] = await this.openRequests([line.id], undefined, rideId, true);
      // Not at this line's terminals → 404; otherwise someone was faster, or it closed.
      throw ride ? conflict('This request was already taken or is no longer open') : notFound();
    }
    await this.record('taxi_ride.accepted', row, actor, meta);
    return (await this.toOperatorRides([row]))[0]!;
  }

  /** An accepted ride goes back to the terminal's requests, with a fresh wait. */
  private async releaseRide(ride: TaxiRideRow, actor: Authenticated, meta: RequestMeta) {
    const [row] = await this.database.db
      .update(taxiRides)
      .set({
        status: 'requested',
        organizationId: null,
        driverUserId: null,
        vehicleId: null,
        fareAmount: null,
        fareCurrency: null,
        acceptedAt: null,
        expiresAt: new Date(Date.now() + TAXI_REQUEST_MINUTES * MINUTE_MS),
      })
      .where(and(eq(taxiRides.id, ride.id), eq(taxiRides.status, 'accepted')))
      .returning();
    if (!row) throw conflict('Only an accepted ride can be released');
    await this.record('taxi_ride.released', row, actor, meta, {
      organizationId: ride.organizationId,
      driverUserId: ride.driverUserId,
    });
  }

  /**
   * Open requests at the terminals the lines serve, oldest first, never the user's own. With
   * `rideId` and `anyStatus`, looks that ride up at those terminals whatever its status.
   */
  private async openRequests(
    organizationIds: string[],
    excludePassengerId?: string,
    rideId?: string,
    anyStatus = false,
  ): Promise<TaxiRequest[]> {
    const rows = await this.database.db
      .selectDistinct({ ride: taxiRides, firstName: users.firstName })
      .from(taxiRides)
      .innerJoin(users, eq(users.id, taxiRides.passengerUserId))
      .innerJoin(
        taxiServiceAreas,
        and(
          eq(taxiServiceAreas.stopId, taxiRides.terminalStopId),
          inArray(taxiServiceAreas.organizationId, organizationIds),
        ),
      )
      .where(
        and(
          anyStatus ? undefined : eq(taxiRides.status, 'requested'),
          rideId ? eq(taxiRides.id, rideId) : undefined,
          excludePassengerId ? ne(taxiRides.passengerUserId, excludePassengerId) : undefined,
        ),
      )
      .orderBy(asc(taxiRides.createdAt))
      .limit(100);
    const terminals = await this.stops.summaries(rows.map((r) => r.ride.terminalStopId));
    return rows.map(({ ride, firstName }) => ({
      ...requestFields(ride, terminals.get(ride.terminalStopId)!),
      passengerFirstName: firstName,
    }));
  }

  /** Active taxi lines where the user is a member whose role drives. */
  private async driverLines(userId: string): Promise<OrganizationRow[]> {
    const rows = await this.database.db
      .select({ organization: organizations })
      .from(memberships)
      .innerJoin(
        organizations,
        and(
          eq(organizations.id, memberships.organizationId),
          eq(organizations.type, 'taxi_line'),
          eq(organizations.status, 'active'),
        ),
      )
      .where(and(eq(memberships.userId, userId), inArray(memberships.role, DRIVING_ROLES)));
    return rows.map((r) => r.organization);
  }

  private drivers(organizationId: string) {
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

  private async terminalIdsOf(organizationId: string): Promise<string[]> {
    const rows = await this.database.db
      .select({ stopId: taxiServiceAreas.stopId })
      .from(taxiServiceAreas)
      .where(eq(taxiServiceAreas.organizationId, organizationId));
    return rows.map((r) => r.stopId);
  }

  private async requireMine(userId: string, rideId: string): Promise<TaxiRideRow> {
    await expireTaxiRequests(this.database.db);
    const [ride] = await this.database.db
      .select()
      .from(taxiRides)
      .where(and(eq(taxiRides.id, rideId), eq(taxiRides.passengerUserId, userId)));
    if (!ride) throw notFound();
    return ride;
  }

  /** Loads the people, lines, vehicles and terminals the rides refer to. */
  private async related(rows: TaxiRideRow[]) {
    const ids = <K extends keyof TaxiRideRow>(key: K) =>
      [
        ...new Set(rows.map((r) => r[key]).filter((v): v is NonNullable<typeof v> => !!v)),
      ] as string[];
    const userIds = [...ids('passengerUserId'), ...ids('driverUserId')];
    const [people, lines, fleet, terminals] = await Promise.all([
      userIds.length ? this.database.db.select().from(users).where(inArray(users.id, userIds)) : [],
      ids('organizationId').length
        ? this.database.db
            .select({
              id: organizations.id,
              legalName: organizations.legalName,
              tradeName: organizations.tradeName,
            })
            .from(organizations)
            .where(inArray(organizations.id, ids('organizationId')))
        : [],
      ids('vehicleId').length
        ? this.database.db
            .select({ id: vehicles.id, plate: vehicles.plate, label: vehicles.label })
            .from(vehicles)
            .where(inArray(vehicles.id, ids('vehicleId')))
        : [],
      this.stops.summaries(ids('terminalStopId')),
    ]);
    return {
      user: new Map(people.map((u) => [u.id, u])),
      line: new Map(lines.map((o) => [o.id, o])),
      vehicle: new Map(fleet.map((v) => [v.id, v])),
      terminal: terminals,
    };
  }

  /** The passenger's view: the driver's name, verified phone and vehicle once taken. */
  private async toRides(rows: TaxiRideRow[]): Promise<TaxiRide[]> {
    const { user, line, vehicle, terminal } = await this.related(rows);
    return rows.map((ride) => {
      const driver = ride.driverUserId ? user.get(ride.driverUserId) : undefined;
      return {
        id: ride.id,
        status: ride.status,
        terminal: terminal.get(ride.terminalStopId)!,
        direction: ride.direction,
        address: ride.address,
        notes: ride.notes,
        passengers: ride.passengers,
        fare:
          ride.fareAmount && ride.fareCurrency
            ? { amount: ride.fareAmount, currency: ride.fareCurrency }
            : null,
        organization: (ride.organizationId && line.get(ride.organizationId)) || null,
        driver: driver
          ? {
              firstName: driver.firstName,
              lastName: driver.lastName,
              phone: driver.phoneVerifiedAt ? driver.phone : null,
            }
          : null,
        vehicle: (ride.vehicleId && vehicle.get(ride.vehicleId)) || null,
        requestedAt: ride.createdAt.toISOString(),
        expiresAt: ride.expiresAt.toISOString(),
        acceptedAt: ride.acceptedAt?.toISOString() ?? null,
        pickedUpAt: ride.pickedUpAt?.toISOString() ?? null,
        completedAt: ride.completedAt?.toISOString() ?? null,
        cancelledAt: ride.cancelledAt?.toISOString() ?? null,
      };
    });
  }

  /** The line's view of rides it took: the passenger's name and contact phone. */
  private async toOperatorRides(rows: TaxiRideRow[]): Promise<OperatorTaxiRide[]> {
    const { user, vehicle, terminal } = await this.related(rows);
    return rows.flatMap((ride) => {
      if (!ride.organizationId || !ride.driverUserId || !ride.vehicleId || !ride.acceptedAt) {
        return [];
      }
      const passenger = user.get(ride.passengerUserId)!;
      const driver = user.get(ride.driverUserId)!;
      return [
        {
          ...requestFields(ride, terminal.get(ride.terminalStopId)!),
          passengerFirstName: passenger.firstName,
          status: ride.status,
          organizationId: ride.organizationId,
          passenger: {
            firstName: passenger.firstName,
            lastName: passenger.lastName,
            phone: ride.contactPhone,
          },
          driver: { userId: driver.id, firstName: driver.firstName, lastName: driver.lastName },
          vehicle: vehicle.get(ride.vehicleId)!,
          fare: { amount: ride.fareAmount!, currency: ride.fareCurrency! },
          acceptedAt: ride.acceptedAt.toISOString(),
          pickedUpAt: ride.pickedUpAt?.toISOString() ?? null,
          completedAt: ride.completedAt?.toISOString() ?? null,
        },
      ];
    });
  }

  private record(
    action: string,
    ride: TaxiRideRow,
    actor: Authenticated,
    meta: RequestMeta,
    metadata: Record<string, unknown> = {},
  ) {
    return this.audit.record({
      action,
      actorUserId: actor.user.id,
      targetType: 'taxi_ride',
      targetId: ride.id,
      ip: meta.ip,
      metadata: {
        organizationId: ride.organizationId,
        driverUserId: ride.driverUserId,
        vehicleId: ride.vehicleId,
        ...metadata,
      },
    });
  }
}

function assertTaxiLine(organization: OrganizationRow): OrganizationRow {
  if (organization.type !== 'taxi_line') throw conflict('Only taxi lines dispatch taxis');
  return organization;
}

function requestFields(ride: TaxiRideRow, terminal: StopSummary) {
  return {
    id: ride.id,
    terminal,
    direction: ride.direction,
    address: ride.address,
    notes: ride.notes,
    passengers: ride.passengers,
    requestedAt: ride.createdAt.toISOString(),
    expiresAt: ride.expiresAt.toISOString(),
  };
}

const byName = (a: StopSummary, b: StopSummary) => a.name.localeCompare(b.name, 'es');
