import { randomInt, randomUUID } from 'node:crypto';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import type {
  AuthResponse,
  DriverTaxiBoard,
  FleetVehicle,
  OnDemandFare,
  OperatorTaxiRide,
  OtpChallengeResponse,
  PendingRideFee,
  ServiceArea,
  Stop,
  StretchOption,
  TaxiRide,
} from '@vtp/shared-types';
import { eq } from 'drizzle-orm';
import request from 'supertest';
import { DatabaseService } from '../src/database/database.service.js';
import { users } from '../src/modules/identity/identity.schema.js';
import { settlementEntries } from '../src/modules/settlements/settlements.schema.js';
import { rideCancellationFees, taxiRides } from '../src/modules/taxi/taxi.schema.js';
import type { OtpMessage, OtpSender } from '../src/modules/identity/otp/otp-sender.js';

const expectDatabase = process.env.E2E_EXPECT_DATABASE === 'true';

class CapturingOtpSender implements OtpSender {
  readonly sent: OtpMessage[] = [];
  async send(message: OtpMessage): Promise<void> {
    this.sent.push(message);
  }
  codeFor(destination: string): string {
    const message = this.sent.findLast((m) => m.destination === destination);
    if (!message) throw new Error(`No code sent to ${destination}`);
    return message.code;
  }
}

/** Taxis and motorcycles on demand between two stops of a corridor (ADR-028). */
describe.runIf(expectDatabase)('On-demand stretch rides (e2e)', () => {
  let app: NestExpressApplication;
  const otp = new CapturingOtpSender();
  const http = () => request(app.getHttpServer());
  const run = randomUUID().slice(0, 8);

  beforeAll(async () => {
    process.env.AUTH_RATE_LIMIT_MAX = '1000';
    process.env.RATE_LIMIT_MAX = '10000';
    process.env.OTP_RESEND_SECONDS = '0';
    process.env.OTP_MAX_PER_HOUR = '100';
    const { AppModule } = await import('../src/app.module.js');
    const { configureApp } = await import('../src/app.setup.js');
    const { OTP_SENDER } = await import('../src/modules/identity/otp/otp-sender.js');
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(OTP_SENDER)
      .useValue(otp)
      .compile();
    app = moduleRef.createNestApplication<NestExpressApplication>();
    configureApp(app);
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  const signIn = async (role?: 'admin') => {
    const email = `ride-e2e-${randomUUID()}@example.com`;
    const challenge = (
      await http()
        .post('/api/v1/auth/otp/request')
        .send({ channel: 'email', destination: email })
        .expect(202)
    ).body as OtpChallengeResponse;
    const res = (
      await http()
        .post('/api/v1/auth/otp/verify')
        .send({ challengeId: challenge.challengeId, code: otp.codeFor(email), client: 'web' })
        .expect(200)
    ).body as AuthResponse;
    if (role) {
      await app
        .get(DatabaseService)
        .db.update(users)
        .set({ platformRole: role })
        .where(eq(users.id, res.user.id));
    }
    return { auth: `Bearer ${res.tokens.accessToken}`, user: res.user };
  };
  const reason = (res: request.Response) =>
    (res.body as { error: { reason?: string } }).error.reason;

  it(
    'quotes stretch fares, offers rides to the lines that ride them and keeps drivers free',
    { timeout: 30_000 },
    async () => {
      const admin = await signIn('admin');
      const stop = async (name: string) =>
        (
          await http()
            .post('/api/v1/admin/stops')
            .set('Authorization', admin.auth)
            .send({
              kind: 'stop',
              name: `${name} ${run}`,
              city: `${name} ${run}`,
              state: 'Bolívar',
            })
            .expect(201)
        ).body as Stop;
      const a = await stop('Demanda San Félix');
      const b = await stop('Demanda Puerto Ordaz');
      const outside = await stop('Demanda Caracas');
      const area = (
        await http()
          .post('/api/v1/admin/service-areas')
          .set('Authorization', admin.auth)
          .send({ name: `Demanda ${run}`, stopIds: [a.id, b.id], active: true })
          .expect(201)
      ).body as ServiceArea;

      // Three approved lines; their owners drive (owners have every permission).
      const line = async (type: 'taxi_line' | 'moto_line', plate: string) => {
        const owner = await signIn();
        const { organization } = (
          await http()
            .post('/api/v1/organizations')
            .set('Authorization', owner.auth)
            .send({
              type,
              legalName: `${type} ${run} ${plate}`,
              rif: `J-${randomInt(10_000_000, 99_999_999)}-${randomInt(0, 9)}`,
            })
            .expect(201)
        ).body as { organization: { id: string } };
        await http()
          .post(`/api/v1/admin/organizations/${organization.id}/review`)
          .set('Authorization', admin.auth)
          .send({ decision: 'approve' })
          .expect(200);
        const url = `/api/v1/organizations/${organization.id}`;
        const vehicle = (
          await http()
            .post(`${url}/vehicles`)
            .set('Authorization', owner.auth)
            .send({ plate })
            .expect(201)
        ).body as FleetVehicle;
        const fares = (body: object) =>
          http().put(`${url}/taxi/stretch-fares`).set('Authorization', owner.auth).send(body);
        return { id: organization.id, url, owner, vehicle, fares };
      };
      const motos = await line('moto_line', `MT${randomInt(100, 999)}AB`);
      const taxis = await line('taxi_line', `TX${randomInt(100, 999)}AB`);
      const cheaper = await line('taxi_line', `TY${randomInt(100, 999)}AB`);

      // --- Fixed fares per stretch, either way, in the line's own vehicle.
      const fare = (mode: string, amount: string, stops = [a.id, b.id]) => ({
        fares: [{ stopIds: stops, mode, amount, currency: 'USD' }],
      });
      expect(reason(await motos.fares(fare('car', '3.00')).expect(409))).toBe(
        'TRANSPORT_MODE_NOT_ALLOWED',
      );
      expect(
        reason(await motos.fares(fare('motorcycle', '2.00', [a.id, outside.id])).expect(409)),
      ).toBe('ROUTE_OUTSIDE_SERVICE_AREA');
      expect(
        ((await motos.fares(fare('motorcycle', '2')).expect(200)).body as OnDemandFare[])[0],
      ).toMatchObject({ mode: 'motorcycle', amount: '2.00', serviceAreaId: area.id });
      await taxis.fares(fare('car', '5.00', [b.id, a.id])).expect(200);
      await cheaper.fares(fare('car', '4.00')).expect(200);
      const options = (
        await http().get('/api/v1/taxi/stretch-options').query({ from: b.id, to: a.id }).expect(200)
      ).body as StretchOption[];
      expect(options).toEqual([
        { mode: 'car', lines: 2, currency: 'USD', minFare: '4.00', maxFare: '5.00' },
        { mode: 'motorcycle', lines: 1, currency: 'USD', minFare: '2.00', maxFare: '2.00' },
      ]);

      // --- A motorcycle ride for now: one passenger, offered to the motorcycle line only.
      const ask = (auth: string, body: object) =>
        http()
          .post('/api/v1/me/taxi-rides')
          .set('Authorization', auth)
          .send({
            kind: 'stretch',
            fromStopId: a.id,
            toStopId: b.id,
            address: 'Calle 3, casa azul, al lado de la panadería',
            passengers: 1,
            ...body,
          });
      const rider = await signIn();
      expect(reason(await ask(rider.auth, { mode: 'motorcycle', passengers: 2 }).expect(409))).toBe(
        'MOTORCYCLE_ONE_PASSENGER',
      );
      const ride = (await ask(rider.auth, { mode: 'motorcycle' }).expect(201)).body as TaxiRide;
      expect(ride).toMatchObject({
        kind: 'stretch',
        status: 'requested',
        mode: 'motorcycle',
        terminal: null,
        from: expect.objectContaining({ id: a.id }),
        to: expect.objectContaining({ id: b.id }),
        scheduledFor: null,
        fare: null,
      });
      const board = async (owner: { auth: string }) =>
        (await http().get('/api/v1/me/taxi').set('Authorization', owner.auth).expect(200))
          .body as DriverTaxiBoard;
      expect((await board(motos.owner)).requests.map((r) => r.id)).toContain(ride.id);
      expect((await board(taxis.owner)).requests.map((r) => r.id)).not.toContain(ride.id);
      // Taking it: the line's fixed fare, no quote.
      const accepted = (
        await http()
          .post(`/api/v1/me/taxi/rides/${ride.id}/accept`)
          .set('Authorization', motos.owner.auth)
          .send({ organizationId: motos.id, vehicleId: motos.vehicle.id })
          .expect(200)
      ).body as OperatorTaxiRide;
      expect(accepted).toMatchObject({
        kind: 'stretch',
        fare: { amount: '2.00', currency: 'USD' },
      });

      // --- A car booked for tomorrow does not keep the driver from taking a ride now.
      const tomorrow = new Date(Date.now() + 24 * 3600_000).toISOString();
      const early = await signIn();
      const booked = (
        await ask(early.auth, { mode: 'car', passengers: 2, scheduledFor: tomorrow }).expect(201)
      ).body as TaxiRide;
      expect(booked.scheduledFor).not.toBeNull();
      const accept = (rideId: string) =>
        http()
          .post(`/api/v1/me/taxi/rides/${rideId}/accept`)
          .set('Authorization', taxis.owner.auth)
          .send({ organizationId: taxis.id, vehicleId: taxis.vehicle.id });
      expect(((await accept(booked.id).expect(200)).body as OperatorTaxiRide).fare).toEqual({
        amount: '5.00',
        currency: 'USD',
      });
      const now = await signIn();
      const soon = (await ask(now.auth, { mode: 'car' }).expect(201)).body as TaxiRide;
      await accept(soon.id).expect(200);
      const driving = await board(taxis.owner);
      expect(driving.current?.id).toBe(soon.id);
      expect(driving.upcoming.map((r) => r.id)).toEqual([booked.id]);
      // A second ride for now: the driver is already on one.
      const another = await signIn();
      const third = (await ask(another.auth, { mode: 'car' }).expect(201)).body as TaxiRide;
      expect(reason(await accept(third.id).expect(409))).toBe('DRIVER_BUSY');

      // --- Switching the corridor off stops new rides and hides the options.
      await http()
        .patch(`/api/v1/admin/service-areas/${area.id}`)
        .set('Authorization', admin.auth)
        .send({ active: false })
        .expect(200);
      const late = await signIn();
      expect(reason(await ask(late.auth, { mode: 'car' }).expect(409))).toBe('SERVICE_DISABLED');
      expect(
        (
          await http()
            .get('/api/v1/taxi/stretch-options')
            .query({ from: a.id, to: b.id })
            .expect(200)
        ).body,
      ).toEqual([]);
    },
  );
  it(
    'pays stretch rides with a trip pack and earns the line its fare when done',
    { timeout: 30_000 },
    async () => {
      const admin = await signIn('admin');
      const db = app.get(DatabaseService).db;
      const stop = async (name: string) =>
        (
          await http()
            .post('/api/v1/admin/stops')
            .set('Authorization', admin.auth)
            .send({
              kind: 'stop',
              name: `${name} ${run}`,
              city: `${name} ${run}`,
              state: 'Bolívar',
            })
            .expect(201)
        ).body as Stop;
      const a = await stop('Paquete moto A');
      const b = await stop('Paquete moto B');
      const area = (
        await http()
          .post('/api/v1/admin/service-areas')
          .set('Authorization', admin.auth)
          .send({ name: `Paquete moto ${run}`, stopIds: [a.id, b.id], active: true })
          .expect(201)
      ).body as ServiceArea;
      const owner = await signIn();
      const { organization } = (
        await http()
          .post('/api/v1/organizations')
          .set('Authorization', owner.auth)
          .send({
            type: 'moto_line',
            legalName: `Motos paquete ${run}`,
            rif: `J-${randomInt(10_000_000, 99_999_999)}-${randomInt(0, 9)}`,
          })
          .expect(201)
      ).body as { organization: { id: string } };
      await http()
        .post(`/api/v1/admin/organizations/${organization.id}/review`)
        .set('Authorization', admin.auth)
        .send({ decision: 'approve' })
        .expect(200);
      const url = `/api/v1/organizations/${organization.id}`;
      const vehicle = (
        await http()
          .post(`${url}/vehicles`)
          .set('Authorization', owner.auth)
          .send({ plate: `MP${randomInt(100, 999)}AB` })
          .expect(201)
      ).body as FleetVehicle;
      await http()
        .put(`${url}/taxi/stretch-fares`)
        .set('Authorization', owner.auth)
        .send({
          fares: [{ stopIds: [a.id, b.id], mode: 'motorcycle', amount: '2.00', currency: 'USD' }],
        })
        .expect(200);

      // A paid motorcycle pack of the stretch.
      const product = (
        await http()
          .post('/api/v1/admin/trip-pack-products')
          .set('Authorization', admin.auth)
          .send({
            serviceAreaId: area.id,
            stopIds: [a.id, b.id],
            mode: 'motorcycle',
            trips: 5,
            price: '8',
            currency: 'USD',
          })
          .expect(201)
      ).body as { id: string };
      const rider = await signIn();
      const pack = (
        await http()
          .post('/api/v1/me/trip-packs')
          .set('Authorization', rider.auth)
          .send({ productId: product.id })
          .expect(201)
      ).body as { id: string; code: string };
      const payment = (
        await http()
          .post(`/api/v1/me/trip-packs/${pack.id}/payments`)
          .set('Authorization', rider.auth)
          .send({ method: 'usdt' })
          .expect(201)
      ).body as { id: string };
      await http()
        .post(`/api/v1/me/payments/${payment.id}/simulate`)
        .set('Authorization', rider.auth)
        .send({})
        .expect(200);
      const remaining = async () =>
        (
          (
            await http()
              .get(`/api/v1/me/trip-packs/${pack.id}`)
              .set('Authorization', rider.auth)
              .expect(200)
          ).body as { remaining: number }
        ).remaining;
      const ask = () =>
        http().post('/api/v1/me/taxi-rides').set('Authorization', rider.auth).send({
          kind: 'stretch',
          fromStopId: b.id,
          toStopId: a.id,
          mode: 'motorcycle',
          passengers: 1,
          address: 'Esquina de la plaza, casa verde',
          tripPackId: pack.id,
        });

      // Only lines that accept packs ride with them.
      expect(reason(await ask().expect(409))).toBe('TRIP_PACK_NOT_VALID_HERE');
      await http()
        .put(`/api/v1/admin/organizations/${organization.id}/policy`)
        .set('Authorization', admin.auth)
        .send({ commissionRate: null, refundTiers: null, acceptsTripPacks: true })
        .expect(200);

      // Asking spends the trip; cancelling before a line takes it gives it back.
      const first = (await ask().expect(201)).body as TaxiRide;
      expect(first.tripPack).toEqual({ id: pack.id, code: pack.code });
      expect(await remaining()).toBe(4);
      const board = (
        await http().get('/api/v1/me/taxi').set('Authorization', owner.auth).expect(200)
      ).body as DriverTaxiBoard;
      expect(board.requests.find((r) => r.id === first.id)?.paidWithPack).toBe(true);
      await http()
        .post(`/api/v1/me/taxi-rides/${first.id}/cancel`)
        .set('Authorization', rider.auth)
        .expect(200);
      expect(await remaining()).toBe(5);

      // A request nobody takes in time gives the trip back too.
      const unanswered = (await ask().expect(201)).body as TaxiRide;
      await db
        .update(taxiRides)
        .set({ expiresAt: new Date(Date.now() - 60_000) })
        .where(eq(taxiRides.id, unanswered.id));
      await http().get('/api/v1/me/taxi-rides').set('Authorization', rider.auth).expect(200);
      expect(await remaining()).toBe(5);

      // Taken, ridden and completed: the line earns its fare, the platform collected the pack.
      const ride = (await ask().expect(201)).body as TaxiRide;
      const step = (path: string, body?: object) =>
        http()
          .post(`/api/v1/me/taxi/rides/${ride.id}/${path}`)
          .set('Authorization', owner.auth)
          .send(body ?? {})
          .expect(200);
      await step('accept', { organizationId: organization.id, vehicleId: vehicle.id });
      await step('pickup');
      await step('complete');
      expect(await remaining()).toBe(4);
      const entries = await db
        .select()
        .from(settlementEntries)
        .where(eq(settlementEntries.taxiRideId, ride.id));
      expect(entries).toEqual([
        expect.objectContaining({
          kind: 'booking',
          gross: '2.00',
          collectedBy: 'platform',
          organizationId: organization.id,
          bookingId: null,
        }),
      ]);
      const listed = (
        await http().get(`${url}/settlement/entries`).set('Authorization', owner.auth).expect(200)
      ).body as { taxiRideId: string | null; bookingCode: string; route: { name: string } }[];
      expect(listed.find((e) => e.taxiRideId === ride.id)).toMatchObject({
        bookingCode: expect.stringMatching(/^TAXI-/),
        route: { name: expect.stringContaining('Moto') },
      });
    },
  );

  it(
    'charges a late cancellation on the next ride, for the line that went out',
    { timeout: 30_000 },
    async () => {
      const admin = await signIn('admin');
      const db = app.get(DatabaseService).db;
      const stop = async (name: string) =>
        (
          await http()
            .post('/api/v1/admin/stops')
            .set('Authorization', admin.auth)
            .send({
              kind: 'stop',
              name: `${name} ${run}`,
              city: `${name} ${run}`,
              state: 'Bolívar',
            })
            .expect(201)
        ).body as Stop;
      const a = await stop('Tasa A');
      const b = await stop('Tasa B');
      await http()
        .post('/api/v1/admin/service-areas')
        .set('Authorization', admin.auth)
        .send({ name: `Tasa ${run}`, stopIds: [a.id, b.id], active: true })
        .expect(201);
      const line = async (amount: string) => {
        const owner = await signIn();
        const { organization } = (
          await http()
            .post('/api/v1/organizations')
            .set('Authorization', owner.auth)
            .send({
              type: 'moto_line',
              legalName: `Motos tasa ${run} ${amount}`,
              rif: `J-${randomInt(10_000_000, 99_999_999)}-${randomInt(0, 9)}`,
            })
            .expect(201)
        ).body as { organization: { id: string } };
        await http()
          .post(`/api/v1/admin/organizations/${organization.id}/review`)
          .set('Authorization', admin.auth)
          .send({ decision: 'approve' })
          .expect(200);
        // A known commission, whatever the platform default is.
        await http()
          .put(`/api/v1/admin/organizations/${organization.id}/policy`)
          .set('Authorization', admin.auth)
          .send({ commissionRate: '10.00', refundTiers: null })
          .expect(200);
        const url = `/api/v1/organizations/${organization.id}`;
        const vehicle = (
          await http()
            .post(`${url}/vehicles`)
            .set('Authorization', owner.auth)
            .send({ plate: `MF${randomInt(100, 999)}AB` })
            .expect(201)
        ).body as FleetVehicle;
        await http()
          .put(`${url}/taxi/stretch-fares`)
          .set('Authorization', owner.auth)
          .send({ fares: [{ stopIds: [a.id, b.id], mode: 'motorcycle', amount, currency: 'USD' }] })
          .expect(200);
        const step = (rideId: string, path: string) =>
          http()
            .post(`/api/v1/me/taxi/rides/${rideId}/${path}`)
            .set('Authorization', owner.auth)
            .send(
              path === 'accept' ? { organizationId: organization.id, vehicleId: vehicle.id } : {},
            )
            .expect(200);
        return { id: organization.id, owner, step };
      };
      const first = await line('2.00');
      const second = await line('3.00');
      const rider = await signIn();
      const ask = async (body: object = {}) =>
        (
          await http()
            .post('/api/v1/me/taxi-rides')
            .set('Authorization', rider.auth)
            .send({
              kind: 'stretch',
              fromStopId: a.id,
              toStopId: b.id,
              mode: 'motorcycle',
              passengers: 1,
              address: 'Frente a la bodega, casa blanca',
              ...body,
            })
            .expect(201)
        ).body as TaxiRide;
      const cancel = async (rideId: string) =>
        (
          await http()
            .post(`/api/v1/me/taxi-rides/${rideId}/cancel`)
            .set('Authorization', rider.auth)
            .expect(200)
        ).body as TaxiRide;
      const fees = async () =>
        (await http().get('/api/v1/me/taxi-fees').set('Authorization', rider.auth).expect(200))
          .body as PendingRideFee[];
      const takenAgo = (rideId: string, minutes: number) =>
        db
          .update(taxiRides)
          .set({ acceptedAt: new Date(Date.now() - minutes * 60_000) })
          .where(eq(taxiRides.id, rideId));

      // --- Within 3 minutes of being taken: free. The passenger sees until when, and the fee.
      const quick = await ask();
      await first.step(quick.id, 'accept');
      const shown = (
        await http()
          .get(`/api/v1/me/taxi-rides/${quick.id}`)
          .set('Authorization', rider.auth)
          .expect(200)
      ).body as TaxiRide;
      expect(shown.lateCancellationFee).toEqual({ amount: '1.00', currency: 'USD' });
      expect(Date.parse(shown.freeCancellationUntil!) - Date.parse(shown.acceptedAt!)).toBe(
        3 * 60_000,
      );
      await cancel(quick.id);
      expect(await fees()).toEqual([]);

      // --- Booked for tomorrow: free until 30 minutes before, however long ago it was taken.
      const booked = await ask({
        scheduledFor: new Date(Date.now() + 24 * 3600_000).toISOString(),
      });
      await first.step(booked.id, 'accept');
      await takenAgo(booked.id, 10);
      await cancel(booked.id);
      expect(await fees()).toEqual([]);

      // --- Later: 50 % of the line's fare, owed until the next ride.
      const late = await ask();
      await first.step(late.id, 'accept');
      await takenAgo(late.id, 4);
      await cancel(late.id);
      expect(await fees()).toEqual([expect.objectContaining({ amount: '1.00', currency: 'USD' })]);

      // The next ride, with another line: its driver sees the fee and collects it in cash.
      const next = await ask();
      expect(next.feesDue).toEqual([{ amount: '1.00', currency: 'USD' }]);
      const board = (
        await http().get('/api/v1/me/taxi').set('Authorization', second.owner.auth).expect(200)
      ).body as DriverTaxiBoard;
      expect(board.requests.find((r) => r.id === next.id)?.feesDue).toEqual([
        { amount: '1.00', currency: 'USD' },
      ]);
      await second.step(next.id, 'accept');
      await second.step(next.id, 'pickup');
      await second.step(next.id, 'complete');
      expect(await fees()).toEqual([]);
      // The first line earns it (minus commission); the second owes what it collected.
      const entries = await db
        .select()
        .from(settlementEntries)
        .where(eq(settlementEntries.taxiRideId, late.id));
      expect(entries).toHaveLength(2);
      expect(entries).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            organizationId: first.id,
            kind: 'ride_cancellation_fee',
            collectedBy: 'platform',
            gross: '1.00',
            commission: '0.10',
            earned: '0.90',
          }),
          expect.objectContaining({
            organizationId: second.id,
            kind: 'ride_cancellation_fee',
            collectedBy: 'operator',
            gross: '1.00',
            commission: '0.00',
            earned: '0.00',
          }),
        ]),
      );
      const [charged] = await db
        .select()
        .from(rideCancellationFees)
        .where(eq(rideCancellationFees.cancelledRideId, late.id));
      expect(charged?.chargedRideId).toBe(next.id);
      // Already charged: a later ride owes nothing.
      expect((await ask()).feesDue).toEqual([]);
      const last = (
        await http().get('/api/v1/me/taxi-rides').set('Authorization', rider.auth).expect(200)
      ).body as TaxiRide[];
      await cancel(last[0]!.id);

      // --- The same line collects its own fee: it owes only the commission.
      const again = await ask();
      await second.step(again.id, 'accept');
      await takenAgo(again.id, 5);
      await cancel(again.id);
      const following = await ask();
      expect(following.feesDue).toEqual([{ amount: '1.50', currency: 'USD' }]);
      await second.step(following.id, 'accept');
      await second.step(following.id, 'pickup');
      await second.step(following.id, 'complete');
      expect(
        await db.select().from(settlementEntries).where(eq(settlementEntries.taxiRideId, again.id)),
      ).toEqual([
        expect.objectContaining({
          organizationId: second.id,
          collectedBy: 'operator',
          gross: '1.50',
          commission: '0.15',
          earned: '1.35',
        }),
      ]);
    },
  );
});
