import { randomInt, randomUUID } from 'node:crypto';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import type {
  AssistedTaxiRide,
  AuthResponse,
  DriverTaxiBoard,
  FleetVehicle,
  OrganizationMembershipSummary,
  OtpChallengeResponse,
  PublicTaxiRide,
  ReceivedInvitation,
  Stop,
  TaxiDispatchBoard,
} from '@vtp/shared-types';
import { eq } from 'drizzle-orm';
import request from 'supertest';
import { DatabaseService } from '../src/database/database.service.js';
import { users } from '../src/modules/identity/identity.schema.js';
import { taxiRides } from '../src/modules/taxi/taxi.schema.js';
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

describe.runIf(expectDatabase)('Taxi by WhatsApp (e2e)', () => {
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

  const signIn = async (email = `taxi-wa-e2e-${randomUUID()}@example.com`) => {
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
    'lets staff ask for a taxi or moto for a WhatsApp customer, who follows and rates it by link',
    { timeout: 30_000 },
    async () => {
      const reviewer = await signIn();
      const db = app.get(DatabaseService).db;
      await db
        .update(users)
        .set({ platformRole: 'reviewer' })
        .where(eq(users.id, reviewer.user.id));
      const terminal = (
        await http()
          .post('/api/v1/admin/stops')
          .set('Authorization', reviewer.auth)
          .send({
            kind: 'terminal',
            name: `Terminal Casacoima ${run}`,
            city: 'Casacoima',
            state: 'Delta Amacuro',
          })
          .expect(201)
      ).body as Stop;

      const owner = await signIn();
      const { organization } = (
        await http()
          .post('/api/v1/organizations')
          .set('Authorization', owner.auth)
          .send({
            type: 'taxi_line',
            legalName: `Taxis Casacoima ${run}`,
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
      await http()
        .put(`${url}/taxi/terminals`)
        .set('Authorization', owner.auth)
        .send({ stopIds: [terminal.id] })
        .expect(200);
      const driverEmail = `taxi-wa-driver-${randomUUID()}@example.com`;
      await http()
        .post(`${url}/invitations`)
        .set('Authorization', owner.auth)
        .send({ contactKind: 'email', destination: driverEmail, role: 'driver' })
        .expect(201);
      const driver = await signIn(driverEmail);
      const [received] = (
        await http().get('/api/v1/me/invitations').set('Authorization', driver.auth).expect(200)
      ).body as ReceivedInvitation[];
      await http()
        .post(`/api/v1/me/invitations/${received!.id}/accept`)
        .set('Authorization', driver.auth)
        .expect(204);
      // Online ("en línea"): only connected drivers see and take requests.
      await http()
        .put('/api/v1/me/taxi/availability')
        .set('Authorization', driver.auth)
        .send({ online: true })
        .expect(200);
      const moto = (
        await http()
          .post(`${url}/vehicles`)
          .set('Authorization', owner.auth)
          .send({ plate: 'TX301AA' })
          .expect(201)
      ).body as FleetVehicle;

      // --- Staff take the order written on WhatsApp. Its own phone per run: the same phone is
      // the same guest passenger, with one open ride at a time.
      const digits = String(randomInt(1_000_000, 9_999_999));
      const assisted = (body: object = {}, auth = reviewer.auth) =>
        http()
          .post('/api/v1/admin/taxi-rides')
          .set('Authorization', auth)
          .send({
            customerName: 'Carmen',
            customerPhone: `0416-${digits}`,
            terminalStopId: terminal.id,
            direction: 'to_terminal',
            address: 'Calle Bolívar, frente a la plaza',
            passengers: 1,
            ...body,
          });
      await assisted({}, driver.auth).expect(403);
      await assisted({ customerPhone: '12' }).expect(400);
      await assisted({ tripPackId: randomUUID() }).expect(400);
      // A motorcycle carries one (stretch rides between two stops of a zone).
      expect(
        (
          await assisted({
            kind: 'stretch',
            fromStopId: randomUUID(),
            toStopId: randomUUID(),
            mode: 'motorcycle',
            passengers: 2,
          }).expect(409)
        ).body.error,
      ).toMatchObject({ reason: 'MOTORCYCLE_ONE_PASSENGER' });
      const created = (await assisted().expect(201)).body as AssistedTaxiRide;
      expect(created).toMatchObject({
        customer: { name: 'Carmen', phone: `+58416${digits}` },
        ride: {
          status: 'requested',
          kind: 'terminal',
          direction: 'to_terminal',
          channel: 'whatsapp',
        },
        trackingPath: expect.stringMatching(/^\/taxi\/[A-Za-z0-9_-]{20,40}$/),
      });
      const token = created.trackingPath.split('/').pop()!;
      const listed = (
        await http().get('/api/v1/admin/taxi-rides').set('Authorization', reviewer.auth).expect(200)
      ).body as AssistedTaxiRide[];
      expect(listed.find((r) => r.ride.id === created.ride.id)?.customer.name).toBe('Carmen');

      // Drivers see it like any request, with the customer's first name.
      const seen = (
        (await http().get('/api/v1/me/taxi').set('Authorization', driver.auth).expect(200))
          .body as DriverTaxiBoard
      ).requests.find((r) => r.id === created.ride.id);
      expect(seen).toMatchObject({ passengerFirstName: 'Carmen', passengers: 1 });

      // --- The tracking link: no account, no phones.
      const track = (path = '') => http().get(`/api/v1/taxi/track/${token}${path}`);
      await http().get('/api/v1/taxi/track/short').expect(404);
      await http()
        .get(`/api/v1/taxi/track/${'x'.repeat(24)}`)
        .expect(404);
      const view = (await track().expect(200)).body as PublicTaxiRide;
      expect(view).toMatchObject({
        status: 'requested',
        kind: 'terminal',
        mode: 'car',
        terminal: terminal.name,
        canCancel: true,
        canRate: false,
        driverFirstName: null,
      });
      expect(JSON.stringify(view)).not.toContain(digits);

      // The same phone is the same guest: one open ride at a time, as in the app.
      expect((await assisted({ customerName: 'Carmen R.' }).expect(409)).body.error).toMatchObject({
        reason: 'TAXI_RIDE_OPEN',
      });

      // A second customer: they cancel from the link.
      const other = (
        await assisted({
          customerName: 'Pedro',
          customerPhone: '0414-5550000',
          passengers: 3,
        }).expect(201)
      ).body as AssistedTaxiRide;
      const otherToken = other.trackingPath.split('/').pop()!;
      const cancelled = (await http().post(`/api/v1/taxi/track/${otherToken}/cancel`).expect(200))
        .body as PublicTaxiRide;
      expect(cancelled).toMatchObject({ status: 'cancelled', canCancel: false });
      await http().post(`/api/v1/taxi/track/${otherToken}/cancel`).expect(409);

      // --- The driver takes it and finishes; the customer rates it once.
      await http().post(`/api/v1/taxi/track/${token}/rate`).send({ rating: 5 }).expect(409);
      await http()
        .post(`/api/v1/me/taxi/rides/${created.ride.id}/accept`)
        .set('Authorization', driver.auth)
        .send({
          organizationId: organization.id,
          vehicleId: moto.id,
          fareAmount: '2.00',
          fareCurrency: 'USD',
        })
        .expect(200);
      const accepted = (await track().expect(200)).body as PublicTaxiRide;
      expect(accepted).toMatchObject({
        status: 'accepted',
        vehicle: { plate: 'TX301AA' },
        fare: { amount: '2.00', currency: 'USD' },
        canCancel: true,
      });
      expect(accepted.driverFirstName).not.toBeUndefined();
      expect(JSON.stringify(accepted)).not.toMatch(/phone|email/i);
      for (const step of ['pickup', 'complete']) {
        await http()
          .post(`/api/v1/me/taxi/rides/${created.ride.id}/${step}`)
          .set('Authorization', driver.auth)
          .expect(200);
      }
      const done = (await track().expect(200)).body as PublicTaxiRide;
      expect(done).toMatchObject({ status: 'completed', canCancel: false, canRate: true });
      await http().post(`/api/v1/taxi/track/${token}/cancel`).expect(409);
      await http().post(`/api/v1/taxi/track/${token}/rate`).send({ rating: 6 }).expect(400);
      const rated = (
        await http()
          .post(`/api/v1/taxi/track/${token}/rate`)
          .send({ rating: 4, comment: '  Muy amable  ' })
          .expect(200)
      ).body as PublicTaxiRide;
      expect(rated).toMatchObject({ rating: 4, canRate: false });
      expect(
        (await http().post(`/api/v1/taxi/track/${token}/rate`).send({ rating: 1 }).expect(409)).body
          .error,
      ).toMatchObject({ reason: 'TAXI_RIDE_WRONG_STEP' });

      // A week later the link stops working.
      await db
        .update(taxiRides)
        .set({ createdAt: new Date(Date.now() - 8 * 86_400_000) })
        .where(eq(taxiRides.id, created.ride.id));
      await track().expect(404);

      // The line sees the rating on its board.
      const dispatch = (
        await http().get(`${url}/taxi`).set('Authorization', owner.auth).expect(200)
      ).body as TaxiDispatchBoard;
      expect(dispatch.rides.find((r) => r.id === created.ride.id)).toMatchObject({
        rating: 4,
        ratingComment: 'Muy amable',
      });

      // Carmen writes again: staff get her same guest (her history and any fee she owes), renamed.
      const again = (await assisted({ customerName: 'Carmen Rojas' }).expect(201))
        .body as AssistedTaxiRide;
      const passengerOf = async (rideId: string) =>
        (
          await db
            .select({ id: taxiRides.passengerUserId })
            .from(taxiRides)
            .where(eq(taxiRides.id, rideId))
        )[0]!.id;
      expect(await passengerOf(again.ride.id)).toBe(await passengerOf(created.ride.id));
      expect(await passengerOf(again.ride.id)).not.toBe(await passengerOf(other.ride.id));
      expect(again.customer.name).toBe('Carmen Rojas');
    },
  );
});
