import { randomBytes } from 'node:crypto';
import { HttpStatus, Injectable } from '@nestjs/common';
import {
  formatMoney,
  MAX_MOTO_PASSENGERS,
  TAXI_TRACKING_DAYS,
  rolesWith,
  TAXI_REQUEST_MINUTES,
  type AcceptTaxiRideRequest,
  type AssistedTaxiRequest,
  type AssistedTaxiRide,
  type PublicTaxiRide,
  type RateTaxiRideRequest,
  type DriverTaxiBoard,
  type OperatorTaxiRide,
  type RequestTaxiRequest,
  type StopSummary,
  type TaxiDispatchBoard,
  type TaxiRequest,
  type TaxiRide,
  type TaxiTerminal,
} from '@vtp/shared-types';
import { and, asc, count, desc, eq, gt, inArray, isNull, lte, ne, or } from 'drizzle-orm';
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
import { NotificationsService } from '../notifications/notifications.service.js';
import type { OrganizationAccess } from '../organizations/organization-access.js';
import {
  memberships,
  organizations,
  type OrganizationRow,
} from '../organizations/organizations.schema.js';
import { taxiRides, taxiServiceAreas, type TaxiRideRow } from './taxi.schema.js';

const DRIVING_ROLES = rolesWith('trips.drive');
const ACTIVE = ['accepted', 'in_progress'] as const;
const MINUTE_MS = 60_000;
/** Finished rides stay on the dispatcher's board for this long. */
const RECENT_MS = 24 * 3600_000;

const conflict = ApiException.conflict;
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
    private readonly notifications: NotificationsService,
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
    let contactPhone: string | null = auth.user.phoneVerifiedAt ? auth.user.phone : null;
    if (input.contactPhone?.trim()) {
      contactPhone = normalizePhone(input.contactPhone);
      if (!contactPhone) throw invalid('Enter a valid phone number');
    }
    const row = await this.create(auth.user.id, input, contactPhone, 'app', null);
    await this.record('taxi_ride.requested', row, auth, meta);
    return (await this.toRides([row]))[0]!;
  }

  /**
   * WhatsApp (ADR-035): platform staff ask for a taxi or a motorcycle taxi for someone who wrote
   * to support. The person becomes a guest passenger and follows the ride with a public link.
   */
  async assistedRequest(
    actor: Authenticated,
    input: AssistedTaxiRequest,
    meta: RequestMeta,
  ): Promise<AssistedTaxiRide> {
    const phone = normalizePhone(input.customerPhone);
    if (!phone) throw invalid("Enter the customer's phone number");
    const name = input.customerName.trim();
    const [customer] = await this.database.db
      .insert(users)
      .values({ guest: true, firstName: name })
      .returning({ id: users.id });
    const token = randomBytes(18).toString('base64url');
    const row = await this.create(customer!.id, input, phone, 'whatsapp', token);
    await this.record('taxi_ride.requested_for_whatsapp', row, actor, meta);
    return this.toAssisted(row, name);
  }

  /** Rides staff asked for on WhatsApp in the last two days, newest first. */
  async assistedList(): Promise<AssistedTaxiRide[]> {
    await expireTaxiRequests(this.database.db);
    const rows = await this.database.db
      .select({ ride: taxiRides, name: users.firstName })
      .from(taxiRides)
      .innerJoin(users, eq(users.id, taxiRides.passengerUserId))
      .where(
        and(
          eq(taxiRides.channel, 'whatsapp'),
          gt(taxiRides.createdAt, new Date(Date.now() - 2 * RECENT_MS)),
        ),
      )
      .orderBy(desc(taxiRides.createdAt))
      .limit(100);
    const rides = await this.toRides(rows.map((r) => r.ride));
    return rows.map(({ ride, name }, i) => ({
      ride: rides[i]!,
      customer: { name: name ?? '—', phone: ride.contactPhone ?? '' },
      trackingPath: `/taxi/${ride.trackingToken}`,
    }));
  }

  /** The public tracking page of a WhatsApp ride: no account, only the link's secret. */
  async tracking(token: string): Promise<PublicTaxiRide> {
    await expireTaxiRequests(this.database.db);
    return this.toPublic(await this.requireTracked(token));
  }

  /** The person cancels from the link, before the driver picks them up. */
  async trackingCancel(token: string): Promise<PublicTaxiRide> {
    const ride = await this.requireTracked(token);
    const [row] = await this.database.db
      .update(taxiRides)
      .set({ status: 'cancelled', cancelledAt: new Date() })
      .where(and(eq(taxiRides.id, ride.id), inArray(taxiRides.status, ['requested', 'accepted'])))
      .returning();
    if (!row) throw conflict('This ride can no longer be cancelled', 'TAXI_RIDE_NOT_CANCELLABLE');
    await this.audit.record({
      action: 'taxi_ride.cancelled_from_link',
      targetType: 'taxi_ride',
      targetId: row.id,
    });
    return this.toPublic(row);
  }

  async trackingRate(token: string, input: RateTaxiRideRequest): Promise<PublicTaxiRide> {
    const ride = await this.requireTracked(token);
    return this.toPublic(await this.rate(ride.id, input));
  }

  /** The passenger rates a finished ride from the app. */
  async rateMine(userId: string, rideId: string, input: RateTaxiRideRequest): Promise<TaxiRide> {
    const ride = await this.requireMine(userId, rideId);
    return (await this.toRides([await this.rate(ride.id, input)]))[0]!;
  }

  private async rate(rideId: string, input: RateTaxiRideRequest): Promise<TaxiRideRow> {
    const [row] = await this.database.db
      .update(taxiRides)
      .set({
        rating: input.rating,
        ratingComment: input.comment?.trim() || null,
        ratedAt: new Date(),
      })
      .where(
        and(eq(taxiRides.id, rideId), eq(taxiRides.status, 'completed'), isNull(taxiRides.ratedAt)),
      )
      .returning();
    if (!row) {
      throw conflict('Only a finished ride can be rated, once', 'TAXI_RIDE_WRONG_STEP');
    }
    return row;
  }

  private async requireTracked(token: string): Promise<TaxiRideRow> {
    const [ride] = /^[A-Za-z0-9_-]{20,40}$/.test(token)
      ? await this.database.db.select().from(taxiRides).where(eq(taxiRides.trackingToken, token))
      : [];
    // An old link forwarded around should not keep showing an address.
    if (!ride || Date.now() - ride.createdAt.getTime() > TAXI_TRACKING_DAYS * 86_400_000) {
      throw notFound();
    }
    return ride;
  }

  /** Validates and stores a request, then tells the drivers of the lines at that terminal. */
  private async create(
    passengerUserId: string,
    input: RequestTaxiRequest,
    contactPhone: string | null,
    channel: TaxiRideRow['channel'],
    trackingToken: string | null,
  ): Promise<TaxiRideRow> {
    const terminal = (await this.terminals()).find((t) => t.id === input.terminalStopId);
    if (!terminal) throw conflict('No taxi line serves this terminal', 'TAXI_TERMINAL_NOT_SERVED');
    await this.stops.assertServed([terminal.id]);
    const address = input.address.trim();
    if (address.length < 5) throw invalid('Describe the address in at least 5 characters');
    const destination = input.destination?.trim() || null;
    if (input.direction === 'local' && (!destination || destination.length < 3)) {
      throw invalid('Say where the passenger is going');
    }
    const vehicleType = input.vehicleType ?? 'car';
    if (vehicleType === 'moto' && input.passengers > MAX_MOTO_PASSENGERS) {
      throw invalid(`A motorcycle taxi takes ${MAX_MOTO_PASSENGERS} passenger`);
    }
    await expireTaxiRequests(this.database.db);
    let row: TaxiRideRow;
    try {
      [row] = (await this.database.db
        .insert(taxiRides)
        .values({
          passengerUserId,
          terminalStopId: terminal.id,
          direction: input.direction,
          address,
          destination,
          vehicleType,
          channel,
          trackingToken,
          notes: input.notes?.trim() || null,
          passengers: input.passengers,
          contactPhone,
          expiresAt: new Date(Date.now() + TAXI_REQUEST_MINUTES * MINUTE_MS),
        })
        .returning()) as [TaxiRideRow];
    } catch (error) {
      if (violated(error) === 'taxi_rides_passenger_open_key') {
        throw conflict('You already have a taxi ride in progress', 'TAXI_RIDE_OPEN');
      }
      throw error;
    }
    const ride = row;
    this.notifications.later(async () => {
      // Drivers of the active taxi lines that serve this terminal (not the passenger).
      const drivers = await this.database.db
        .selectDistinct({ userId: memberships.userId })
        .from(memberships)
        .innerJoin(organizations, eq(organizations.id, memberships.organizationId))
        .innerJoin(taxiServiceAreas, eq(taxiServiceAreas.organizationId, organizations.id))
        .where(
          and(
            eq(taxiServiceAreas.stopId, ride.terminalStopId),
            eq(organizations.type, 'taxi_line'),
            eq(organizations.status, 'active'),
            inArray(memberships.role, rolesWith('trips.drive')),
            ne(memberships.userId, ride.passengerUserId),
          ),
        );
      return {
        kind: 'taxi_requested',
        userIds: drivers.map((d) => d.userId),
        app: 'transport',
        reference: { key: 'rideId', id: ride.id },
        text: (m) => m.taxiRequested(terminal.name, ride.passengers),
      };
    });
    return row;
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
    if (!row) throw conflict('This ride can no longer be cancelled', 'TAXI_RIDE_NOT_CANCELLABLE');
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
        'TAXI_RIDE_WRONG_STEP',
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
    if (line.status !== 'active')
      throw conflict('The taxi line is not active', 'TAXI_LINE_INACTIVE');
    if (Number(input.fareAmount) <= 0) throw invalid('The fare must be greater than zero');
    const vehicle = await this.vehicles.require(line.id, input.vehicleId);
    if (!vehicle.active) throw conflict('This vehicle is inactive', 'VEHICLE_INACTIVE');
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
        throw conflict('This driver is already on a ride', 'DRIVER_BUSY');
      }
      if (constraint === 'taxi_rides_vehicle_active_key') {
        throw conflict('This vehicle is already on a ride', 'VEHICLE_BUSY');
      }
      throw error;
    }
    if (!row) {
      const [ride] = await this.openRequests([line.id], undefined, rideId, true);
      // Not at this line's terminals → 404; otherwise someone was faster, or it closed.
      throw ride
        ? conflict('This request was already taken or is no longer open', 'TAXI_RIDE_TAKEN')
        : notFound();
    }
    await this.record('taxi_ride.accepted', row, actor, meta);
    const accepted = row;
    this.notifications.send({
      kind: 'taxi_accepted',
      userIds: [accepted.passengerUserId],
      app: 'passenger',
      reference: { key: 'rideId', id: accepted.id },
      text: (m, locale) =>
        m.taxiAccepted(
          vehicle.plate,
          formatMoney(accepted.fareAmount!, accepted.fareCurrency!, locale),
        ),
    });
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
    if (!row) throw conflict('Only an accepted ride can be released', 'TAXI_RIDE_NOT_RELEASABLE');
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
        destination: ride.destination,
        vehicleType: ride.vehicleType,
        channel: ride.channel,
        notes: ride.notes,
        passengers: ride.passengers,
        fare:
          ride.fareAmount && ride.fareCurrency
            ? { amount: ride.fareAmount, currency: ride.fareCurrency }
            : null,
        rating: ride.rating,
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
          rating: ride.rating,
          ratingComment: ride.ratingComment,
        },
      ];
    });
  }

  private async toAssisted(row: TaxiRideRow, name: string): Promise<AssistedTaxiRide> {
    return {
      ride: (await this.toRides([row]))[0]!,
      customer: { name, phone: row.contactPhone ?? '' },
      trackingPath: `/taxi/${row.trackingToken}`,
    };
  }

  /** What the link shows: the driver's first name and the vehicle, never phones or surnames. */
  private async toPublic(ride: TaxiRideRow): Promise<PublicTaxiRide> {
    const { user, line, vehicle, terminal } = await this.related([ride]);
    const driver = ride.driverUserId ? user.get(ride.driverUserId) : undefined;
    const company = ride.organizationId ? line.get(ride.organizationId) : undefined;
    const unit = ride.vehicleId ? vehicle.get(ride.vehicleId) : undefined;
    return {
      status: ride.status,
      vehicleType: ride.vehicleType,
      direction: ride.direction,
      terminal: terminal.get(ride.terminalStopId)!.name,
      address: ride.address,
      destination: ride.destination,
      passengers: ride.passengers,
      line: company ? (company.tradeName ?? company.legalName) : null,
      driverFirstName: driver?.firstName ?? null,
      vehicle: unit ? { plate: unit.plate, label: unit.label } : null,
      fare:
        ride.fareAmount && ride.fareCurrency
          ? { amount: ride.fareAmount, currency: ride.fareCurrency }
          : null,
      requestedAt: ride.createdAt.toISOString(),
      expiresAt: ride.expiresAt.toISOString(),
      acceptedAt: ride.acceptedAt?.toISOString() ?? null,
      pickedUpAt: ride.pickedUpAt?.toISOString() ?? null,
      completedAt: ride.completedAt?.toISOString() ?? null,
      canCancel: ride.status === 'requested' || ride.status === 'accepted',
      canRate: ride.status === 'completed' && ride.ratedAt === null,
      rating: ride.rating,
    };
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
  if (organization.type !== 'taxi_line')
    throw conflict('Only taxi lines dispatch taxis', 'NOT_A_TAXI_LINE');
  return organization;
}

function requestFields(ride: TaxiRideRow, terminal: StopSummary) {
  return {
    id: ride.id,
    terminal,
    direction: ride.direction,
    address: ride.address,
    destination: ride.destination,
    vehicleType: ride.vehicleType,
    notes: ride.notes,
    passengers: ride.passengers,
    requestedAt: ride.createdAt.toISOString(),
    expiresAt: ride.expiresAt.toISOString(),
  };
}

const byName = (a: StopSummary, b: StopSummary) => a.name.localeCompare(b.name, 'es');
