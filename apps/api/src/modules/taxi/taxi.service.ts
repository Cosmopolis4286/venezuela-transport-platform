import { randomInt } from 'node:crypto';
import { HttpStatus, Injectable } from '@nestjs/common';
import {
  cityIn,
  formatMoney,
  MAX_SCHEDULE_AHEAD_DAYS,
  packCovers,
  RIDE_ABANDONED_HOURS,
  RIDE_PICKUP_GRACE_MINUTES,
  TRIP_PACK_RETURN_MINUTES,
  rolesWith,
  TAXI_REQUEST_MINUTES,
  type OnDemandFare,
  type OnDemandMode,
  type ReplaceOnDemandFaresRequest,
  type StretchOption,
  type AcceptTaxiRideRequest,
  type Currency,
  type DriverTaxiBoard,
  type OperatorTaxiRide,
  PICKUP_CODE_MAX_ATTEMPTS,
  type PendingRideFee,
  type RideCancellationPolicy,
  type RequestTaxiRequest,
  type StopSummary,
  type TaxiDispatchBoard,
  type TaxiRequest,
  type TaxiRide,
  type TaxiTerminal,
} from '@vtp/shared-types';
import { and, asc, count, desc, eq, gt, inArray, isNull, lt, lte, ne, or, sql } from 'drizzle-orm';
import { ApiException } from '../../common/errors/api.exception.js';
import {
  DatabaseService,
  type Database,
  type Transaction,
} from '../../database/database.service.js';
import { AuditService } from '../audit/audit.service.js';
import { vehicles } from '../fleet/fleet.schema.js';
import { VehiclesService } from '../fleet/vehicles.service.js';
import { normalizePhone } from '../identity/contact.js';
import { users } from '../identity/identity.schema.js';
import type { Authenticated, RequestMeta } from '../identity/sessions.service.js';
import { serviceAreaStops, stops } from '../network/network.schema.js';
import { ServicesService } from '../network/services.service.js';
import { StopsService } from '../network/stops.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import type { OrganizationAccess } from '../organizations/organization-access.js';
import {
  memberships,
  organizations,
  type OrganizationRow,
} from '../organizations/organizations.schema.js';
import { percentOf, policyFor, recordRideEarning, recordRideFee } from '../settlements/ledger.js';
import { organizationPolicies } from '../settlements/settlements.schema.js';
import { tripPacks } from '../trip-packs/trip-packs.schema.js';
import { TripPacksService } from '../trip-packs/trip-packs.service.js';
import {
  onDemandFares,
  rideCancellationFees,
  taxiRides,
  taxiServiceAreas,
  type RideCancellationFeeRow,
  type TaxiRideRow,
} from './taxi.schema.js';

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

/**
 * Requests nobody took in time; run before reading or taking requests. Trips paid with a pack go
 * back to it (unless it expired meanwhile).
 */
export async function expireTaxiRequests(db: Database, now = new Date()) {
  const expired = await db
    .update(taxiRides)
    .set({ status: 'expired' })
    .where(and(eq(taxiRides.status, 'requested'), lte(taxiRides.expiresAt, now)))
    .returning({ tripPackId: taxiRides.tripPackId, passengers: taxiRides.passengers });
  for (const ride of expired) {
    if (ride.tripPackId) await giveTripsBack(db, ride.tripPackId, ride.passengers);
  }
  await closeAbandonedRides(db, now);
}

/**
 * Rides left open close on their own, so the passenger can ask for another: taken but never
 * picked up are cancelled (free; pack trips go back), picked up but never completed are
 * completed (as if the driver had pressed it).
 */
async function closeAbandonedRides(db: Database, now: Date) {
  const hoursAgo = (hours: number) => new Date(now.getTime() - hours * 3600_000);
  const notPickedUp = await db
    .update(taxiRides)
    .set({ status: 'cancelled', cancelledAt: now })
    .where(
      and(
        eq(taxiRides.status, 'accepted'),
        lte(
          sql`greatest(${taxiRides.acceptedAt}, coalesce(${taxiRides.scheduledFor}, ${taxiRides.acceptedAt}))`,
          hoursAgo(RIDE_ABANDONED_HOURS.accepted),
        ),
      ),
    )
    .returning({ tripPackId: taxiRides.tripPackId, passengers: taxiRides.passengers });
  for (const ride of notPickedUp) {
    if (ride.tripPackId) await giveTripsBack(db, ride.tripPackId, ride.passengers);
  }
  await db.transaction(async (tx) => {
    const forgotten = await tx
      .update(taxiRides)
      .set({ status: 'completed', completedAt: now })
      .where(
        and(
          eq(taxiRides.status, 'in_progress'),
          lte(taxiRides.pickedUpAt, hoursAgo(RIDE_ABANDONED_HOURS.inProgress)),
        ),
      )
      .returning();
    for (const ride of forgotten) await settleCompletedRide(tx, ride, now);
  });
}

/**
 * What completing a ride settles: a ride paid with a pack earns the line its fare (ADR-028), and
 * the driver collected the passenger's pending late-cancellation fees in cash (ADR-030).
 */
async function settleCompletedRide(
  tx: Transaction,
  ride: TaxiRideRow,
  now: Date,
  feesCollected = true,
) {
  if (ride.tripPackId) {
    await recordRideEarning(tx, {
      id: ride.id,
      organizationId: ride.organizationId!,
      passengers: ride.passengers,
      fareAmount: ride.fareAmount!,
      fareCurrency: ride.fareCurrency!,
      tripPackId: ride.tripPackId,
    });
  }
  // The driver says the passenger did not pay them: they stay owed for the next ride.
  if (!feesCollected) return;
  const charged = await tx
    .update(rideCancellationFees)
    .set({ chargedRideId: ride.id, chargedAt: now })
    .where(dueOn(ride))
    .returning();
  for (const fee of charged) await recordRideFee(tx, fee, ride.organizationId!);
}

/** Trips back to a pack that has not expired; the same rule as `TripPacksService.giveBack`. */
async function giveTripsBack(db: Database | Transaction, packId: string, trips: number) {
  await db
    .update(tripPacks)
    .set({
      remaining: sql`least(${tripPacks.trips}, ${tripPacks.remaining} + ${trips})`,
      status: 'active',
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(tripPacks.id, packId),
        inArray(tripPacks.status, ['active', 'exhausted']),
        gt(tripPacks.expiresAt, new Date()),
      ),
    );
}

type Fare = Pick<AcceptTaxiRideRequest, 'vehicleId' | 'fareAmount' | 'fareCurrency'>;

/** Lines that ride on demand, and the vehicle each kind uses (ADR-028). */
const ON_DEMAND_LINE: Record<OnDemandMode, 'taxi_line' | 'moto_line'> = {
  car: 'taxi_line',
  motorcycle: 'moto_line',
};

/** A stretch is stored with its stops in id order: the same row serves both directions. */
const ordered = (a: string, b: string): [string, string] => (a < b ? [a, b] : [b, a]);

/** The fare row of the stretch of a ride (either direction), by vehicle. */
const fareMatchesRide = () =>
  and(
    eq(onDemandFares.stopAId, sql`least(${taxiRides.fromStopId}, ${taxiRides.toStopId})`),
    eq(onDemandFares.stopBId, sql`greatest(${taxiRides.fromStopId}, ${taxiRides.toStopId})`),
    eq(onDemandFares.mode, taxiRides.mode),
  );

@Injectable()
export class TaxiService {
  constructor(
    private readonly database: DatabaseService,
    private readonly audit: AuditService,
    private readonly stops: StopsService,
    private readonly vehicles: VehiclesService,
    private readonly notifications: NotificationsService,
    private readonly services: ServicesService,
    private readonly packs: TripPacksService,
  ) {}

  // --- Passengers -------------------------------------------------------------------------

  /**
   * Active terminals served by at least one active taxi line, where intercity sales are on
   * (terminal taxis are part of the intercity service, ADR-029).
   */
  async terminals(): Promise<TaxiTerminal[]> {
    const { intercity } = await this.services.status();
    if (!intercity.enabled) return [];
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
      .filter((t) => !cityIn(intercity.closedCities, t))
      .sort((a, b) => a.name.localeCompare(b.name, 'es'));
  }

  async request(
    auth: Authenticated,
    input: RequestTaxiRequest,
    meta: RequestMeta,
  ): Promise<TaxiRide> {
    if (input.kind === 'stretch') return this.requestStretch(auth, input, meta);
    if (!input.terminalStopId || !input.direction) {
      throw invalid('Choose the terminal and whether you leave from it or go to it');
    }
    const terminal = (await this.terminals()).find((t) => t.id === input.terminalStopId);
    if (!terminal) {
      const [stop] = (await this.stops.summaries([input.terminalStopId])).values();
      const { intercity } = await this.services.status();
      if (stop && (!intercity.enabled || cityIn(intercity.closedCities, stop))) {
        throw conflict('Terminal taxis are not available here right now', 'SERVICE_DISABLED');
      }
      throw conflict('No taxi line serves this terminal', 'TAXI_TERMINAL_NOT_SERVED');
    }
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
        throw conflict('You already have a taxi ride in progress', 'TAXI_RIDE_OPEN');
      }
      throw error;
    }
    await this.record('taxi_ride.requested', row, auth, meta);
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
            eq(taxiServiceAreas.stopId, terminal.id),
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
    return (await this.toRides([row]))[0]!;
  }

  /**
   * Per vehicle, the lines that ride a stretch on demand and their fares (public): the passenger
   * sees the price before asking.
   */
  async stretchOptions(fromStopId: string, toStopId: string): Promise<StretchOption[]> {
    const [a, b] = ordered(fromStopId, toStopId);
    const rows = await this.database.db
      .select({
        mode: onDemandFares.mode,
        currency: onDemandFares.currency,
        lines: sql<number>`count(*)::int`,
        minFare: sql<string>`min(${onDemandFares.amount})::text`,
        maxFare: sql<string>`max(${onDemandFares.amount})::text`,
      })
      .from(onDemandFares)
      .innerJoin(
        organizations,
        and(eq(organizations.id, onDemandFares.organizationId), eq(organizations.status, 'active')),
      )
      .where(and(eq(onDemandFares.stopAId, a), eq(onDemandFares.stopBId, b)))
      .groupBy(onDemandFares.mode, onDemandFares.currency);
    const open = new Set((await this.services.status()).suburban.areas.map((x) => x.id));
    const [area] = await this.areaOf(a, b);
    if (!area || !open.has(area)) return [];
    return rows
      .filter((r): r is typeof r & { mode: OnDemandMode } => r.mode !== 'bus')
      .sort((x, y) => x.mode.localeCompare(y.mode));
  }

  /** On demand between two stops of a corridor, now or at a set time (ADR-028). */
  private async requestStretch(
    auth: Authenticated,
    input: RequestTaxiRequest,
    meta: RequestMeta,
  ): Promise<TaxiRide> {
    const { fromStopId, toStopId, mode } = input;
    if (!fromStopId || !toStopId || !mode || fromStopId === toStopId) {
      throw invalid('Choose two different stops and the kind of vehicle');
    }
    if (mode === 'motorcycle' && input.passengers !== 1) {
      throw conflict('A motorcycle carries one passenger', 'MOTORCYCLE_ONE_PASSENGER');
    }
    const now = Date.now();
    const scheduledFor = input.scheduledFor ? new Date(input.scheduledFor) : null;
    if (scheduledFor) {
      const at = scheduledFor.getTime();
      if (Number.isNaN(at) || at < now || at > now + MAX_SCHEDULE_AHEAD_DAYS * 86_400_000) {
        throw invalid(`Book between now and ${MAX_SCHEDULE_AHEAD_DAYS} days ahead`);
      }
    }
    const [serviceAreaId] = await this.areaOf(fromStopId, toStopId);
    if (!serviceAreaId) throw invalid('Both stops must belong to one corridor');
    const stopsOf = await this.stops.summaries([fromStopId, toStopId]);
    await this.services.assertOpen({
      service: 'suburban',
      serviceAreaId,
      from: stopsOf.get(fromStopId)!,
      to: stopsOf.get(toStopId)!,
    });
    if (!(await this.stretchOptions(fromStopId, toStopId)).some((o) => o.mode === mode)) {
      throw conflict(
        'No line rides this stretch on demand with that vehicle',
        'TAXI_STRETCH_NOT_SERVED',
      );
    }
    const address = input.address.trim();
    if (address.length < 5) throw invalid('Describe the address in at least 5 characters');
    let contactPhone: string | null = auth.user.phoneVerifiedAt ? auth.user.phone : null;
    if (input.contactPhone?.trim()) {
      contactPhone = normalizePhone(input.contactPhone);
      if (!contactPhone) throw invalid('Enter a valid phone number');
    }
    await expireTaxiRequests(this.database.db);
    const packId = input.tripPackId ?? null;
    if (packId) await this.assertPackFits(auth.user.id, packId, serviceAreaId, input);
    // Waits until a while after the time asked (or from now when it is for now).
    const waitFrom = scheduledFor?.getTime() ?? now;
    let row: TaxiRideRow;
    try {
      row = await this.database.db.transaction(async (tx) => {
        if (packId) {
          // One trip per passenger, spent now; given back if nobody takes it or it is cancelled
          // in time.
          const spent = await this.packs.spend(
            tx,
            auth.user.id,
            packId,
            input.passengers,
            new Date(waitFrom),
          );
          if (!spent) {
            throw conflict(
              'The trip pack has not enough trips left or expires before this ride',
              'TRIP_PACK_EXHAUSTED',
            );
          }
        }
        const [inserted] = (await tx
          .insert(taxiRides)
          .values({
            tripPackId: packId,
            pickupCode: packId ? String(randomInt(0, 10_000)).padStart(4, '0') : null,
            kind: 'stretch',
            passengerUserId: auth.user.id,
            fromStopId,
            toStopId,
            serviceAreaId,
            mode,
            scheduledFor,
            address,
            notes: input.notes?.trim() || null,
            passengers: input.passengers,
            contactPhone,
            expiresAt: new Date(waitFrom + TAXI_REQUEST_MINUTES * MINUTE_MS),
          })
          .returning()) as [TaxiRideRow];
        return inserted;
      });
    } catch (error) {
      if (violated(error) === 'taxi_rides_passenger_open_key') {
        throw conflict('You already have a taxi ride in progress', 'TAXI_RIDE_OPEN');
      }
      throw error;
    }
    await this.record('taxi_ride.requested', row, auth, meta, { kind: 'stretch', mode });
    const ride = row;
    const place = `${stopsOf.get(fromStopId)!.city} → ${stopsOf.get(toStopId)!.city}`;
    this.notifications.later(async () => {
      // Drivers of the active lines with a fare for this stretch and vehicle.
      const [a, b] = ordered(fromStopId, toStopId);
      const drivers = await this.database.db
        .selectDistinct({ userId: memberships.userId })
        .from(memberships)
        .innerJoin(organizations, eq(organizations.id, memberships.organizationId))
        .innerJoin(
          onDemandFares,
          and(
            eq(onDemandFares.organizationId, organizations.id),
            eq(onDemandFares.stopAId, a),
            eq(onDemandFares.stopBId, b),
            eq(onDemandFares.mode, mode),
          ),
        )
        .where(
          and(
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
        text: (m) => m.taxiRequested(place, ride.passengers),
      };
    });
    return (await this.toRides([row]))[0]!;
  }

  /** The pack can pay this stretch ride: the user's, active, same vehicle, corridor and stretch. */
  private async assertPackFits(
    userId: string,
    packId: string,
    serviceAreaId: string,
    input: RequestTaxiRequest,
  ): Promise<void> {
    const pack = await this.packs.row(this.database.db, packId);
    if (!pack || pack.userId !== userId) {
      throw new ApiException('NOT_FOUND', 'Trip pack not found', HttpStatus.NOT_FOUND);
    }
    if (pack.status !== 'active') {
      throw conflict('This trip pack has no trips to use', 'TRIP_PACK_EXHAUSTED');
    }
    const fits =
      pack.mode === input.mode &&
      pack.serviceAreaId === serviceAreaId &&
      packCovers([pack.stopAId, pack.stopBId], input.fromStopId!, input.toStopId!);
    // Some line that rides this stretch with that vehicle must accept packs.
    const [a, b] = ordered(input.fromStopId!, input.toStopId!);
    const [accepting] = fits
      ? await this.database.db
          .select({ id: onDemandFares.organizationId })
          .from(onDemandFares)
          .innerJoin(
            organizationPolicies,
            and(
              eq(organizationPolicies.organizationId, onDemandFares.organizationId),
              eq(organizationPolicies.acceptsTripPacks, true),
            ),
          )
          .where(
            and(
              eq(onDemandFares.stopAId, a),
              eq(onDemandFares.stopBId, b),
              eq(onDemandFares.mode, input.mode!),
            ),
          )
          .limit(1)
      : [];
    if (!fits || !accepting) {
      throw conflict('This trip pack does not cover this ride', 'TRIP_PACK_NOT_VALID_HERE');
    }
  }

  /** The corridor both stops belong to (the first, if several), or none. */
  private async areaOf(a: string, b: string): Promise<string[]> {
    const rows = await this.database.db
      .select({ areaId: serviceAreaStops.serviceAreaId })
      .from(serviceAreaStops)
      .where(inArray(serviceAreaStops.stopId, [a, b]))
      .groupBy(serviceAreaStops.serviceAreaId)
      .having(sql`count(*) = 2`);
    return rows.map((r) => r.areaId);
  }

  // --- On-demand fares (lines) ------------------------------------------------------------

  async faresOf(access: OrganizationAccess): Promise<OnDemandFare[]> {
    const line = assertOnDemandLine(access.organization);
    const rows = await this.database.db
      .select()
      .from(onDemandFares)
      .where(eq(onDemandFares.organizationId, line.id));
    const summaries = await this.stops.summaries([
      ...new Set(rows.flatMap((r) => [r.stopAId, r.stopBId])),
    ]);
    return rows
      .map((r) => ({
        serviceAreaId: r.serviceAreaId,
        stops: [summaries.get(r.stopAId)!, summaries.get(r.stopBId)!] as [StopSummary, StopSummary],
        mode: r.mode as OnDemandMode,
        amount: r.amount,
        currency: r.currency,
      }))
      .sort((x, y) => x.stops[0].city.localeCompare(y.stops[0].city, 'es'));
  }

  /** Replaces the line's fixed on-demand fares: both stops of one corridor, its own vehicle. */
  async replaceFares(
    access: OrganizationAccess,
    input: ReplaceOnDemandFaresRequest,
    actor: Authenticated,
    meta: RequestMeta,
  ): Promise<OnDemandFare[]> {
    const line = assertOnDemandLine(access.organization);
    const values: (typeof onDemandFares.$inferInsert)[] = [];
    const seen = new Set<string>();
    for (const fare of input.fares) {
      if (ON_DEMAND_LINE[fare.mode] !== line.type) {
        throw conflict(
          'This organization does not run that kind of vehicle',
          'TRANSPORT_MODE_NOT_ALLOWED',
        );
      }
      const [a, b] = ordered(fare.stopIds[0], fare.stopIds[1]);
      if (a === b) throw invalid('The two stops must be different');
      if (!(Number(fare.amount) > 0)) throw invalid('Fares must be greater than zero');
      const key = `${a}:${b}:${fare.mode}`;
      if (seen.has(key)) throw invalid('Each stretch can have only one fare per vehicle');
      seen.add(key);
      const [serviceAreaId] = await this.areaOf(a, b);
      if (!serviceAreaId) {
        throw conflict('Both stops must belong to one corridor', 'ROUTE_OUTSIDE_SERVICE_AREA');
      }
      values.push({
        organizationId: line.id,
        serviceAreaId,
        stopAId: a,
        stopBId: b,
        mode: fare.mode,
        amount: Number(fare.amount).toFixed(2),
        currency: fare.currency,
      });
    }
    await this.database.db.transaction(async (tx) => {
      await tx.delete(onDemandFares).where(eq(onDemandFares.organizationId, line.id));
      if (values.length) await tx.insert(onDemandFares).values(values);
    });
    await this.audit.record({
      action: 'on_demand_fares.replaced',
      actorUserId: actor.user.id,
      targetType: 'organization',
      targetId: line.id,
      ip: meta.ip,
      metadata: { count: values.length },
    });
    return this.faresOf(access);
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
    const now = new Date();
    const policy = ride.organizationId
      ? (await policyFor(this.database.db, ride.organizationId)).rideCancellation
      : null;
    const fee = policy ? lateFeeOf(ride, policy, now.getTime()) : null;
    const row = await this.database.db.transaction(async (tx) => {
      const [cancelled] = await tx
        .update(taxiRides)
        .set({ status: 'cancelled', cancelledAt: now })
        .where(
          and(
            eq(taxiRides.id, ride.id),
            // The fee was worked out for the ride as read: it must not have moved since.
            eq(taxiRides.status, ride.status),
            inArray(taxiRides.status, ['requested', 'accepted']),
          ),
        )
        .returning();
      if (!cancelled) return undefined;
      // Paid with a pack: the trips always go back (the late fee is charged apart, ADR-028).
      if (cancelled.tripPackId) {
        await giveTripsBack(tx, cancelled.tripPackId, cancelled.passengers);
      }
      // Cancelled late after a line took it: the passenger owes it a fee, paid on the next ride.
      if (fee) {
        await tx.insert(rideCancellationFees).values({
          cancelledRideId: cancelled.id,
          passengerUserId: cancelled.passengerUserId,
          organizationId: cancelled.organizationId!,
          amount: fee.amount,
          currency: fee.currency,
        });
      }
      return cancelled;
    });
    if (!row) throw conflict('This ride can no longer be cancelled', 'TAXI_RIDE_NOT_CANCELLABLE');
    await this.record('taxi_ride.cancelled', row, auth, meta, fee ? { lateFee: fee } : {});
    return (await this.toRides([row]))[0]!;
  }

  /** Late-cancellation fees the passenger still owes; paid in cash on the next ride. */
  async pendingFees(userId: string): Promise<PendingRideFee[]> {
    const rows = await this.database.db
      .select()
      .from(rideCancellationFees)
      .where(
        and(
          eq(rideCancellationFees.passengerUserId, userId),
          isNull(rideCancellationFees.chargedAt),
        ),
      )
      .orderBy(asc(rideCancellationFees.createdAt));
    return rows.map((f) => ({
      id: f.id,
      amount: f.amount,
      currency: f.currency,
      createdAt: f.createdAt.toISOString(),
    }));
  }

  // --- Drivers ----------------------------------------------------------------------------

  async driverBoard(userId: string): Promise<DriverTaxiBoard> {
    await expireTaxiRequests(this.database.db);
    const lines = await this.driverLines(userId);
    const lineIds = lines.map((l) => l.id);
    const fleet = await Promise.all(lineIds.map((id) => this.vehicles.list(id)));
    const mine = await this.database.db
      .select()
      .from(taxiRides)
      .where(and(eq(taxiRides.driverUserId, userId), inArray(taxiRides.status, ACTIVE)))
      .orderBy(asc(taxiRides.scheduledFor));
    // On the road: in progress, for now, or booked within the next half hour; the rest is later.
    const soon = Date.now() + 30 * MINUTE_MS;
    const due = (r: TaxiRideRow) =>
      r.status === 'in_progress' || !r.scheduledFor || r.scheduledFor.getTime() <= soon;
    const current =
      mine.find((r) => r.status === 'in_progress') ?? mine.find((r) => due(r)) ?? null;
    const upcoming = mine.filter((r) => r !== current);
    const requests = lineIds.length ? await this.openRequests(lineIds, userId) : [];
    return {
      current: current ? ((await this.toOperatorRides([current]))[0] ?? null) : null,
      upcoming: await this.toOperatorRides(upcoming),
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
    options: { feesCollected?: boolean; pickupCode?: string } = {},
  ): Promise<OperatorTaxiRide | null> {
    const feesCollected = options.feesCollected ?? true;
    const [ride] = await this.database.db
      .select()
      .from(taxiRides)
      .where(and(eq(taxiRides.id, rideId), eq(taxiRides.driverUserId, auth.user.id)));
    if (!ride) throw notFound();
    if (step === 'release') {
      await this.releaseRide(ride, auth, meta);
      return null;
    }
    if (step === 'pickup' && ride.pickupCode && ride.status === 'accepted') {
      await this.checkPickupCode(ride, options.pickupCode, auth, meta);
    }
    const now = new Date();
    const row = await this.database.db.transaction(async (tx) => {
      const [updated] = await tx
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
      if (updated && step === 'complete') {
        await settleCompletedRide(tx, updated, now, feesCollected);
      }
      return updated;
    });
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
    const organizationId = assertOnDemandLine(access.organization).id;
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
    const line = assertOnDemandLine(access.organization);
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
    const vehicle = await this.vehicles.require(line.id, input.vehicleId);
    if (!vehicle.active) throw conflict('This vehicle is inactive', 'VEHICLE_INACTIVE');
    await expireTaxiRequests(this.database.db);
    const [ride] = await this.database.db.select().from(taxiRides).where(eq(taxiRides.id, rideId));
    if (!ride) throw notFound();
    // Terminal rides: the line quotes the fare. Stretch rides: its fixed fare for the stretch.
    let fare: { amount: string; currency: TaxiRideRow['fareCurrency'] & string };
    if (ride.tripPackId && !(await policyFor(this.database.db, line.id)).acceptsTripPacks) {
      throw conflict('Your line does not accept trip packs', 'TRIP_PACK_NOT_VALID_HERE');
    }
    if (ride.kind === 'stretch') {
      if (vehicle.mode !== ride.mode) {
        throw conflict(
          'This vehicle is of a different kind than the ride',
          'VEHICLE_MODE_MISMATCH',
        );
      }
      const [a, b] = ordered(ride.fromStopId!, ride.toStopId!);
      const [own] = await this.database.db
        .select({ amount: onDemandFares.amount, currency: onDemandFares.currency })
        .from(onDemandFares)
        .where(
          and(
            eq(onDemandFares.organizationId, line.id),
            eq(onDemandFares.stopAId, a),
            eq(onDemandFares.stopBId, b),
            eq(onDemandFares.mode, ride.mode),
          ),
        );
      if (!own) throw conflict('Your line has no fare for this stretch', 'TAXI_NO_FARE');
      fare = own;
    } else {
      if (line.type !== 'taxi_line' || !input.fareAmount || !input.fareCurrency) {
        throw invalid('Quote the fare of the terminal ride');
      }
      if (Number(input.fareAmount) <= 0) throw invalid('The fare must be greater than zero');
      fare = { amount: input.fareAmount, currency: input.fareCurrency };
    }
    let row: TaxiRideRow | undefined;
    try {
      [row] = await this.database.db
        .update(taxiRides)
        .set({
          status: 'accepted',
          organizationId: line.id,
          driverUserId,
          vehicleId: vehicle.id,
          fareAmount: fare.amount,
          fareCurrency: fare.currency,
          acceptedAt: new Date(),
        })
        .where(
          and(
            eq(taxiRides.id, rideId),
            eq(taxiRides.status, 'requested'),
            ne(taxiRides.passengerUserId, driverUserId),
            ride.kind === 'stretch'
              ? undefined
              : inArray(
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

  /**
   * A ride paid with a pack starts only with the passenger's code. Wrong tries are counted
   * atomically; after `PICKUP_CODE_MAX_ATTEMPTS` the code is locked (the ride can be released,
   * and an abandoned one closes on its own, giving the trip back to the pack).
   */
  private async checkPickupCode(
    ride: TaxiRideRow,
    code: string | undefined,
    auth: Authenticated,
    meta: RequestMeta,
  ) {
    if (ride.pickupCodeAttempts >= PICKUP_CODE_MAX_ATTEMPTS) {
      throw conflict('Too many wrong pickup codes', 'TAXI_PICKUP_CODE_LOCKED');
    }
    if (code?.trim() === ride.pickupCode) return;
    const [counted] = await this.database.db
      .update(taxiRides)
      .set({ pickupCodeAttempts: sql`${taxiRides.pickupCodeAttempts} + 1` })
      .where(
        and(eq(taxiRides.id, ride.id), lt(taxiRides.pickupCodeAttempts, PICKUP_CODE_MAX_ATTEMPTS)),
      )
      .returning({ attempts: taxiRides.pickupCodeAttempts });
    await this.record('taxi_ride.pickup_code_wrong', ride, auth, meta, {
      attempts: counted?.attempts ?? PICKUP_CODE_MAX_ATTEMPTS,
    });
    throw conflict(
      'That is not the passenger pickup code',
      counted && counted.attempts < PICKUP_CODE_MAX_ATTEMPTS
        ? 'TAXI_PICKUP_CODE_WRONG'
        : 'TAXI_PICKUP_CODE_LOCKED',
    );
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
        expiresAt: new Date(
          Math.max(Date.now(), ride.scheduledFor?.getTime() ?? 0) +
            TAXI_REQUEST_MINUTES * MINUTE_MS,
        ),
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
    const filters = and(
      anyStatus ? undefined : eq(taxiRides.status, 'requested'),
      rideId ? eq(taxiRides.id, rideId) : undefined,
      excludePassengerId ? ne(taxiRides.passengerUserId, excludePassengerId) : undefined,
    );
    // Terminal rides at the lines' terminals, and stretch rides the lines have a fare for.
    const [atTerminals, onStretches] = await Promise.all([
      this.database.db
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
        .where(and(eq(taxiRides.kind, 'terminal'), filters))
        .limit(100),
      this.database.db
        .selectDistinct({ ride: taxiRides, firstName: users.firstName })
        .from(taxiRides)
        .innerJoin(users, eq(users.id, taxiRides.passengerUserId))
        .innerJoin(
          onDemandFares,
          and(fareMatchesRide(), inArray(onDemandFares.organizationId, organizationIds)),
        )
        .leftJoin(
          organizationPolicies,
          eq(organizationPolicies.organizationId, onDemandFares.organizationId),
        )
        .where(
          and(
            eq(taxiRides.kind, 'stretch'),
            filters,
            // Rides paid with a pack only for lines that accept packs (ADR-028).
            or(isNull(taxiRides.tripPackId), eq(organizationPolicies.acceptsTripPacks, true)),
          ),
        )
        .limit(100),
    ]);
    // Rides for now first by age; rides booked for later by their time.
    const when = (r: TaxiRideRow) => (r.scheduledFor ?? r.createdAt).getTime();
    const rows = [...atTerminals, ...onStretches].sort((x, y) => when(x.ride) - when(y.ride));
    const { stop, feesDue } = await this.related(rows.map((r) => r.ride));
    return rows.map(({ ride, firstName }) => ({
      ...requestFields(ride, stop),
      feesDue: feesDue(ride),
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
          inArray(organizations.type, ['taxi_line', 'moto_line']),
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
      this.stops.summaries([...ids('terminalStopId'), ...ids('fromStopId'), ...ids('toStopId')]),
    ]);
    // Fees due on these rides: charged on them, or pending from before they were asked.
    const passengerIds = ids('passengerUserId');
    const fees = rows.length
      ? await this.database.db
          .select()
          .from(rideCancellationFees)
          .where(
            or(
              inArray(
                rideCancellationFees.chargedRideId,
                rows.map((r) => r.id),
              ),
              and(
                inArray(rideCancellationFees.passengerUserId, passengerIds),
                isNull(rideCancellationFees.chargedAt),
              ),
            ),
          )
      : [];
    return {
      feesDue: (ride: TaxiRideRow) => feesDueOn(ride, fees),
      user: new Map(people.map((u) => [u.id, u])),
      line: new Map(lines.map((o) => [o.id, o])),
      vehicle: new Map(fleet.map((v) => [v.id, v])),
      stop: terminals,
    };
  }

  /** The passenger's view: the driver's name, verified phone and vehicle once taken. */
  private async toRides(rows: TaxiRideRow[]): Promise<TaxiRide[]> {
    const { user, line, vehicle, stop, feesDue } = await this.related(rows);
    const policies = new Map<string, RideCancellationPolicy>();
    for (const id of new Set(rows.flatMap((r) => (r.organizationId ? [r.organizationId] : [])))) {
      policies.set(id, (await policyFor(this.database.db, id)).rideCancellation);
    }
    const packIds = rows.flatMap((r) => (r.tripPackId ? [r.tripPackId] : []));
    const packCodes = new Map(
      packIds.length
        ? (
            await this.database.db
              .select({ id: tripPacks.id, code: tripPacks.code })
              .from(tripPacks)
              .where(inArray(tripPacks.id, packIds))
          ).map((p) => [p.id, p.code])
        : [],
    );
    return rows.map((ride) => {
      const driver = ride.driverUserId ? user.get(ride.driverUserId) : undefined;
      const policy = ride.organizationId ? policies.get(ride.organizationId) : undefined;
      const late = policy ? lateWindowOf(ride, policy) : null;
      return {
        id: ride.id,
        kind: ride.kind,
        status: ride.status,
        terminal: ride.terminalStopId ? stop.get(ride.terminalStopId)! : null,
        direction: ride.direction,
        from: ride.fromStopId ? stop.get(ride.fromStopId)! : null,
        to: ride.toStopId ? stop.get(ride.toStopId)! : null,
        mode: ride.mode as OnDemandMode,
        scheduledFor: ride.scheduledFor?.toISOString() ?? null,
        tripPack: ride.tripPackId
          ? { id: ride.tripPackId, code: packCodes.get(ride.tripPackId) ?? '' }
          : null,
        // Only while it matters: before pickup.
        pickupCode:
          ride.status === 'requested' || ride.status === 'accepted' ? ride.pickupCode : null,
        address: ride.address,
        notes: ride.notes,
        passengers: ride.passengers,
        fare:
          ride.fareAmount && ride.fareCurrency
            ? { amount: ride.fareAmount, currency: ride.fareCurrency }
            : null,
        freeCancellationUntil: late ? new Date(late.from).toISOString() : null,
        lateCancellationFee: late?.fee ?? null,
        lateCancellationEndsAt: late ? new Date(late.until).toISOString() : null,
        feesDue: feesDue(ride),
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
    const { user, vehicle, stop, feesDue } = await this.related(rows);
    return rows.flatMap((ride) => {
      if (!ride.organizationId || !ride.driverUserId || !ride.vehicleId || !ride.acceptedAt) {
        return [];
      }
      const passenger = user.get(ride.passengerUserId)!;
      const driver = user.get(ride.driverUserId)!;
      return [
        {
          ...requestFields(ride, stop),
          feesDue: feesDue(ride),
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
  if (organization.type !== 'taxi_line')
    throw conflict('Only taxi lines dispatch taxis', 'NOT_A_TAXI_LINE');
  return organization;
}

/** Taxi and motorcycle taxi lines ride on demand (ADR-028). */
function assertOnDemandLine(organization: OrganizationRow): OrganizationRow {
  if (organization.type !== 'taxi_line' && organization.type !== 'moto_line')
    throw conflict('Only taxi and motorcycle taxi lines ride on demand', 'NOT_A_TAXI_LINE');
  return organization;
}

function requestFields(ride: TaxiRideRow, stop: Map<string, StopSummary>) {
  return {
    id: ride.id,
    kind: ride.kind,
    terminal: ride.terminalStopId ? stop.get(ride.terminalStopId)! : null,
    direction: ride.direction,
    from: ride.fromStopId ? stop.get(ride.fromStopId)! : null,
    to: ride.toStopId ? stop.get(ride.toStopId)! : null,
    mode: ride.mode as OnDemandMode,
    scheduledFor: ride.scheduledFor?.toISOString() ?? null,
    paidWithPack: ride.tripPackId !== null,
    address: ride.address,
    notes: ride.notes,
    passengers: ride.passengers,
    requestedAt: ride.createdAt.toISOString(),
    expiresAt: ride.expiresAt.toISOString(),
  };
}

const byName = (a: StopSummary, b: StopSummary) => a.name.localeCompare(b.name, 'es');

/**
 * When cancelling a stretch ride a line took starts to cost a fee, and how much (null: it never
 * does). Free for `freeMinutes` after it was taken, and up to 30 minutes before a ride booked for
 * later (the same window as trip packs, ADR-028).
 */
function lateWindowOf(
  ride: TaxiRideRow,
  policy: RideCancellationPolicy,
): { from: number; until: number; fee: { amount: string; currency: Currency } } | null {
  if (ride.kind !== 'stretch' || ride.status !== 'accepted' || !ride.acceptedAt) return null;
  const amount = percentOf(ride.fareAmount!, policy.feePercent);
  if (toCents(amount) === 0) return null;
  const taken = ride.acceptedAt.getTime();
  const asked = ride.scheduledFor?.getTime() ?? 0;
  const from = Math.max(
    taken + policy.freeMinutes * MINUTE_MS,
    asked - TRIP_PACK_RETURN_MINUTES * MINUTE_MS,
  );
  // The driver should have picked the passenger up by then: later, cancelling is free again.
  const until = Math.max(taken, asked) + RIDE_PICKUP_GRACE_MINUTES * MINUTE_MS;
  return from < until ? { from, until, fee: { amount, currency: ride.fareCurrency! } } : null;
}

/** The fee owed for cancelling `ride` at `now`, or null when it is free. */
function lateFeeOf(ride: TaxiRideRow, policy: RideCancellationPolicy, now: number) {
  const late = lateWindowOf(ride, policy);
  return late && now >= late.from && now < late.until ? late.fee : null;
}

const toCents = (amount: string) => Math.round(Number(amount) * 100);

/** Pending fees the passenger had when they asked for `ride`: its driver collects them. */
const dueOn = (ride: TaxiRideRow) =>
  and(
    eq(rideCancellationFees.passengerUserId, ride.passengerUserId),
    isNull(rideCancellationFees.chargedAt),
    lte(rideCancellationFees.createdAt, ride.createdAt),
  );

/** The same as `dueOn` in memory, plus the fees already charged on the ride. */
function feesDueOn(ride: TaxiRideRow, fees: RideCancellationFeeRow[]) {
  const open = ['requested', 'accepted', 'in_progress'].includes(ride.status);
  return fees
    .filter((f) =>
      f.chargedRideId
        ? f.chargedRideId === ride.id
        : open &&
          f.passengerUserId === ride.passengerUserId &&
          f.createdAt.getTime() <= ride.createdAt.getTime(),
    )
    .map((f) => ({ amount: f.amount, currency: f.currency }));
}
