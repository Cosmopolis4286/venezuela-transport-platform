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
  ServiceArea,
  Stop,
  StretchOption,
  TaxiRide,
} from '@vtp/shared-types';
import { eq } from 'drizzle-orm';
import request from 'supertest';
import { DatabaseService } from '../src/database/database.service.js';
import { users } from '../src/modules/identity/identity.schema.js';
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

  it('quotes stretch fares, offers rides to the lines that ride them and keeps drivers free', async () => {
    const admin = await signIn('admin');
    const stop = async (name: string) =>
      (
        await http()
          .post('/api/v1/admin/stops')
          .set('Authorization', admin.auth)
          .send({ kind: 'stop', name: `${name} ${run}`, city: `${name} ${run}`, state: 'Bolívar' })
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
    expect(accepted).toMatchObject({ kind: 'stretch', fare: { amount: '2.00', currency: 'USD' } });

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
      (await http().get('/api/v1/taxi/stretch-options').query({ from: a.id, to: b.id }).expect(200))
        .body,
    ).toEqual([]);
  });
});
