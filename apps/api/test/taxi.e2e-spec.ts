import { randomInt, randomUUID } from 'node:crypto';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import type {
  AuthResponse,
  DriverTaxiBoard,
  FleetVehicle,
  OperatorTaxiRide,
  OrganizationMembershipSummary,
  OtpChallengeResponse,
  ReceivedInvitation,
  Stop,
  TaxiDispatchBoard,
  TaxiRide,
  TaxiTerminal,
} from '@vtp/shared-types';
import { eq } from 'drizzle-orm';
import request from 'supertest';
import { DatabaseService } from '../src/database/database.service.js';
import { notifications } from '../src/modules/notifications/notifications.schema.js';
import { NotificationsService } from '../src/modules/notifications/notifications.service.js';
import { users } from '../src/modules/identity/identity.schema.js';
import type { OtpMessage, OtpSender } from '../src/modules/identity/otp/otp-sender.js';
import { taxiRides } from '../src/modules/taxi/taxi.schema.js';

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

describe.runIf(expectDatabase)('Taxi dispatch (e2e)', () => {
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

  const signIn = async (email = `taxi-e2e-${randomUUID()}@example.com`) => {
    const challenge = (
      await http()
        .post('/api/v1/auth/otp/request')
        .send({ channel: 'email', destination: email })
        .expect(202)
    ).body as OtpChallengeResponse;
    const res = (
      await http()
        .post('/api/v1/auth/otp/verify')
        .send({ challengeId: challenge.challengeId, code: otp.codeFor(email), client: 'passenger' })
        .expect(200)
    ).body as AuthResponse;
    return { auth: `Bearer ${res.tokens.accessToken}`, user: res.user, email };
  };

  it(
    'lets passengers request taxis at terminals and taxi lines take them, one at a time',
    { timeout: 30_000 },
    async () => {
      const reviewer = await signIn();
      const db = app.get(DatabaseService).db;
      await db
        .update(users)
        .set({ platformRole: 'reviewer' })
        .where(eq(users.id, reviewer.user.id));
      const stop = async (kind: 'terminal' | 'stop', name: string) =>
        (
          await http()
            .post('/api/v1/admin/stops')
            .set('Authorization', reviewer.auth)
            .send({ kind, name: `${name} ${run}`, city: 'Caracas', state: 'Distrito Capital' })
            .expect(201)
        ).body as Stop;
      const bandera = await stop('terminal', 'Terminal La Bandera');
      const oriente = await stop('terminal', 'Terminal de Oriente');
      const corner = await stop('stop', 'Parada Chacaíto');

      const organization = async (type: 'taxi_line' | 'bus_company', name: string) => {
        const owner = await signIn();
        const { organization } = (
          await http()
            .post('/api/v1/organizations')
            .set('Authorization', owner.auth)
            .send({
              type,
              legalName: `${name} ${run}`,
              rif: `J-${randomInt(10_000_000, 99_999_999)}-${randomInt(0, 9)}`,
            })
            .expect(201)
        ).body as OrganizationMembershipSummary;
        await http()
          .post(`/api/v1/admin/organizations/${organization.id}/review`)
          .set('Authorization', reviewer.auth)
          .send({ decision: 'approve' })
          .expect(200);
        const url = `/api/v1/organizations/${organization.id}`;
        const addMember = async (role: string) => {
          const email = `taxi-member-${randomUUID()}@example.com`;
          await http()
            .post(`${url}/invitations`)
            .set('Authorization', owner.auth)
            .send({ contactKind: 'email', destination: email, role })
            .expect(201);
          const member = await signIn(email);
          const [received] = (
            await http().get('/api/v1/me/invitations').set('Authorization', member.auth).expect(200)
          ).body as ReceivedInvitation[];
          await http()
            .post(`/api/v1/me/invitations/${received!.id}/accept`)
            .set('Authorization', member.auth)
            .expect(204);
          return member;
        };
        const vehicle = async (plate: string) =>
          (
            await http()
              .post(`${url}/vehicles`)
              .set('Authorization', owner.auth)
              .send({ plate })
              .expect(201)
          ).body as FleetVehicle;
        return { id: organization.id, url, owner, addMember, vehicle };
      };

      // --- Two taxi lines at La Bandera; a bus company has no taxi board.
      const lineA = await organization('taxi_line', 'Taxis Bandera');
      const lineB = await organization('taxi_line', 'Línea Unión');
      const buses = await organization('bus_company', 'Autobuses');
      await http()
        .put(`${lineA.url}/taxi/terminals`)
        .set('Authorization', lineA.owner.auth)
        .send({ stopIds: [corner.id] })
        .expect(400);
      for (const line of [lineA, lineB]) {
        await http()
          .put(`${line.url}/taxi/terminals`)
          .set('Authorization', line.owner.auth)
          .send({ stopIds: [bandera.id] })
          .expect(200);
      }
      await http().get(`${buses.url}/taxi`).set('Authorization', buses.owner.auth).expect(409);
      const terminals = (await http().get('/api/v1/taxi/terminals').expect(200))
        .body as TaxiTerminal[];
      expect(terminals.find((t) => t.id === bandera.id)).toMatchObject({ lines: 2 });
      expect(terminals.some((t) => t.id === oriente.id)).toBe(false);

      const [a1, a2, dispatcherA] = [
        await lineA.addMember('driver'),
        await lineA.addMember('driver'),
        await lineA.addMember('dispatcher'),
      ];
      const b1 = await lineB.addMember('driver');
      const [carA1, carA2, carB] = [
        await lineA.vehicle('TX001AA'),
        await lineA.vehicle('TX002AA'),
        await lineB.vehicle('TX900BB'),
      ];

      // --- A passenger asks for a taxi.
      const requestTaxi = (auth: string, body: object = {}) =>
        http()
          .post('/api/v1/me/taxi-rides')
          .set('Authorization', auth)
          .send({
            terminalStopId: bandera.id,
            direction: 'from_terminal',
            address: 'Av. Bolívar, edificio Sol, Los Teques',
            passengers: 2,
            contactPhone: '0414-1234567',
            ...body,
          });
      const ana = await signIn();
      // Both apps registered for push (console delivery in tests).
      const registerPush = (auth: string, app: string, name: string) =>
        http()
          .post('/api/v1/me/push-devices')
          .set('Authorization', auth)
          .send({
            token: `ExponentPushToken[${name}${randomUUID().slice(0, 8)}]`,
            app,
            platform: 'android',
            locale: 'es',
          })
          .expect(204);
      await registerPush(ana.auth, 'passenger', 'ana');
      await registerPush(a1.auth, 'transport', 'a1');
      await registerPush(b1.auth, 'transport', 'b1');
      await requestTaxi(ana.auth, { terminalStopId: oriente.id }).expect(409);
      await requestTaxi(ana.auth, { contactPhone: '12' }).expect(400);
      await requestTaxi(ana.auth, { passengers: 9 }).expect(400);
      const ride1 = (await requestTaxi(ana.auth).expect(201)).body as TaxiRide;
      expect(ride1).toMatchObject({ status: 'requested', fare: null, driver: null });
      expect((await requestTaxi(ana.auth).expect(409)).body.error).toMatchObject({
        reason: 'TAXI_RIDE_OPEN',
        message: expect.stringMatching(/already have/),
      });

      // Drivers of both lines see it, without the passenger's phone.
      const board = async (auth: string) =>
        (await http().get('/api/v1/me/taxi').set('Authorization', auth).expect(200))
          .body as DriverTaxiBoard;
      const seen = await board(a1.auth);
      expect(seen.requests.find((r) => r.id === ride1.id)).toMatchObject({
        address: 'Av. Bolívar, edificio Sol, Los Teques',
        passengers: 2,
        passengerFirstName: null,
      });
      expect(JSON.stringify(seen.requests)).not.toContain('4141234567');
      expect(seen.lines).toEqual([
        expect.objectContaining({ organization: expect.objectContaining({ id: lineA.id }) }),
      ]);
      expect((await board(b1.auth)).requests.some((r) => r.id === ride1.id)).toBe(true);
      expect((await board(ana.auth)).requests).toEqual([]);

      // --- Taking it.
      const accept = (
        auth: string,
        rideId: string,
        organizationId: string,
        vehicleId: string,
        fareAmount = '8.00',
      ) =>
        http()
          .post(`/api/v1/me/taxi/rides/${rideId}/accept`)
          .set('Authorization', auth)
          .send({ organizationId, vehicleId, fareAmount, fareCurrency: 'USD' });
      await accept(a1.auth, ride1.id, lineA.id, carA1.id, '0').expect(400);
      await accept(a1.auth, ride1.id, lineB.id, carB.id).expect(404);
      await accept(a1.auth, ride1.id, lineA.id, carB.id).expect(404);
      const taken = (await accept(a1.auth, ride1.id, lineA.id, carA1.id).expect(200))
        .body as OperatorTaxiRide;
      expect(taken).toMatchObject({
        status: 'accepted',
        passenger: { phone: '+584141234567' },
        vehicle: { plate: 'TX001AA' },
        fare: { amount: '8.00', currency: 'USD' },
      });
      expect((await board(a1.auth)).current?.id).toBe(ride1.id);
      expect((await board(b1.auth)).requests.some((r) => r.id === ride1.id)).toBe(false);
      await accept(b1.auth, ride1.id, lineB.id, carB.id).expect(409);
      // Drivers of both lines heard about the request; Ana heard her taxi is coming.
      await app.get(NotificationsService).settled();
      const noticesAbout = async (userId: string) =>
        (
          await db
            .select({ kind: notifications.kind, reference: notifications.reference })
            .from(notifications)
            .where(eq(notifications.userId, userId))
        ).filter((n) => n.reference === ride1.id);
      expect(await noticesAbout(a1.user.id)).toEqual([
        { kind: 'taxi_requested', reference: ride1.id },
      ]);
      expect(await noticesAbout(b1.user.id)).toEqual([
        { kind: 'taxi_requested', reference: ride1.id },
      ]);
      expect(await noticesAbout(ana.user.id)).toEqual([
        { kind: 'taxi_accepted', reference: ride1.id },
      ]);
      const anaView = (
        await http()
          .get(`/api/v1/me/taxi-rides/${ride1.id}`)
          .set('Authorization', ana.auth)
          .expect(200)
      ).body as TaxiRide;
      expect(anaView).toMatchObject({
        status: 'accepted',
        organization: { id: lineA.id },
        vehicle: { plate: 'TX001AA' },
        fare: { amount: '8.00' },
      });

      // One ride at a time per driver and per vehicle; two drivers racing: one wins.
      const luis = await signIn();
      const ride2 = (
        await requestTaxi(luis.auth, { direction: 'to_terminal', contactPhone: undefined }).expect(
          201,
        )
      ).body as TaxiRide;
      expect(
        (await accept(a1.auth, ride2.id, lineA.id, carA2.id).expect(409)).body.error.message,
      ).toMatch(/driver is already/);
      expect(
        (await accept(a2.auth, ride2.id, lineA.id, carA1.id).expect(409)).body.error.message,
      ).toMatch(/vehicle is already/);
      const race = await Promise.all([
        accept(a2.auth, ride2.id, lineA.id, carA2.id),
        accept(b1.auth, ride2.id, lineB.id, carB.id),
      ]);
      expect(race.map((r) => r.status).sort()).toEqual([200, 409]);
      expect(race.find((r) => r.status === 409)!.body.error).toMatchObject({
        code: 'CONFLICT',
        reason: 'TAXI_RIDE_TAKEN',
      });
      const winner = race[0]!.status === 200 ? a2 : b1;

      // --- The ride itself.
      const step = (auth: string, rideId: string, name: string) =>
        http().post(`/api/v1/me/taxi/rides/${rideId}/${name}`).set('Authorization', auth);
      await step(a1.auth, ride1.id, 'complete').expect(409);
      await step(b1.auth, ride1.id, 'pickup').expect(404);
      await step(a1.auth, ride1.id, 'pickup').expect(200);
      await http()
        .post(`/api/v1/me/taxi-rides/${ride1.id}/cancel`)
        .set('Authorization', ana.auth)
        .expect(409);
      await step(a1.auth, ride1.id, 'release').expect(409);
      expect(
        ((await step(a1.auth, ride1.id, 'complete').expect(200)).body as OperatorTaxiRide).status,
      ).toBe('completed');
      expect((await board(a1.auth)).current).toBeNull();

      // The winner gives ride 2 back; a dispatcher of line A assigns it.
      await step(winner.auth, ride2.id, 'release').expect(204);
      await http()
        .post(`${lineB.url}/taxi/rides/${ride2.id}/release`)
        .set('Authorization', lineB.owner.auth)
        .expect(404);
      const assign = (driverUserId: string, vehicleId: string) =>
        http()
          .post(`${lineA.url}/taxi/rides/${ride2.id}/assign`)
          .set('Authorization', dispatcherA.auth)
          .send({ driverUserId, vehicleId, fareAmount: '120', fareCurrency: 'VES' });
      await assign(dispatcherA.user.id, carA1.id).expect(400);
      await assign(a1.user.id, carA1.id).expect(200);
      const dispatch = (
        await http().get(`${lineA.url}/taxi`).set('Authorization', dispatcherA.auth).expect(200)
      ).body as TaxiDispatchBoard;
      expect(dispatch.terminals.map((t) => t.id)).toEqual([bandera.id]);
      expect(dispatch.rides.map((r) => [r.id, r.status])).toEqual(
        expect.arrayContaining([
          [ride1.id, 'completed'],
          [ride2.id, 'accepted'],
        ]),
      );
      expect(dispatch.drivers.find((d) => d.userId === a1.user.id)?.busy).toBe(true);
      expect(dispatch.vehicles.find((v) => v.id === carA2.id)?.busy).toBe(false);
      await http().get(`${lineA.url}/taxi`).set('Authorization', a2.auth).expect(403);

      // The passenger cancels before pickup; the driver is free again.
      expect(
        (
          (
            await http()
              .post(`/api/v1/me/taxi-rides/${ride2.id}/cancel`)
              .set('Authorization', luis.auth)
              .expect(200)
          ).body as TaxiRide
        ).status,
      ).toBe('cancelled');
      expect((await board(a1.auth)).current).toBeNull();

      // --- Nobody takes it in time.
      const ride3 = (await requestTaxi(luis.auth).expect(201)).body as TaxiRide;
      await db
        .update(taxiRides)
        .set({ expiresAt: new Date(Date.now() - 1000) })
        .where(eq(taxiRides.id, ride3.id));
      await accept(a1.auth, ride3.id, lineA.id, carA1.id).expect(409);
      const history = (
        await http().get('/api/v1/me/taxi-rides').set('Authorization', luis.auth).expect(200)
      ).body as TaxiRide[];
      expect(history.map((r) => r.status)).toEqual(['expired', 'cancelled']);
      await http()
        .get(`/api/v1/me/taxi-rides/${ride1.id}`)
        .set('Authorization', luis.auth)
        .expect(404);
    },
  );
});
