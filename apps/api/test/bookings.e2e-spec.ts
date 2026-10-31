import { randomInt, randomUUID } from 'node:crypto';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import {
  presetLayout,
  type AuthResponse,
  type Booking,
  type Departure,
  type OrganizationMembershipSummary,
  type OtpChallengeResponse,
  type ReceivedInvitation,
  type Route,
  type SeatLayout,
  type Stop,
  type TripAvailability,
  type TripManifest,
  type TripSummary,
} from '@vtp/shared-types';
import { eq, sql } from 'drizzle-orm';
import request from 'supertest';
import { DatabaseService } from '../src/database/database.service.js';
import { bookings } from '../src/modules/bookings/bookings.schema.js';
import { users } from '../src/modules/identity/identity.schema.js';
import type { OtpMessage, OtpSender } from '../src/modules/identity/otp/otp-sender.js';
import { addDays, todayInVenezuela } from '../src/modules/network/departures.js';

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

describe.runIf(expectDatabase)('Bookings (e2e)', () => {
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

  const signIn = async (email = `book-e2e-${randomUUID()}@example.com`) => {
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

  const passenger = (seatNumber: string, n = randomInt(10_000_000, 30_000_000)) => ({
    seatNumber,
    firstName: 'Ana',
    lastName: `Viajera ${run}`,
    documentType: 'V',
    documentNumber: `${n}`,
  });

  it(
    'holds seats, prevents double booking, expires and cancels holds, and lists passengers',
    { timeout: 30_000 },
    async () => {
      // --- Setup: an approved bus company with a published overnight route on a sleeper map.
      const reviewer = await signIn();
      const db = app.get(DatabaseService).db;
      await db
        .update(users)
        .set({ platformRole: 'reviewer' })
        .where(eq(users.id, reviewer.user.id));
      const stop = async (name: string) =>
        (
          await http()
            .post('/api/v1/admin/stops')
            .set('Authorization', reviewer.auth)
            .send({ kind: 'terminal', name: `${name} ${run}`, city: name, state: 'Estado' })
            .expect(201)
        ).body as Stop;
      const [caracas, valencia, maracaibo] = [
        await stop('Caracas'),
        await stop('Valencia'),
        await stop('Maracaibo'),
      ];
      const owner = await signIn();
      const { organization } = (
        await http()
          .post('/api/v1/organizations')
          .set('Authorization', owner.auth)
          .send({
            type: 'bus_company',
            legalName: `Reservas ${run}`,
            rif: `J-${randomInt(10_000_000, 99_999_999)}-${randomInt(0, 9)}`,
          })
          .expect(201)
      ).body as OrganizationMembershipSummary;
      await http()
        .post(`/api/v1/admin/organizations/${organization.id}/review`)
        .set('Authorization', reviewer.auth)
        .send({ decision: 'approve' })
        .expect(200);
      const org = `/api/v1/organizations/${organization.id}`;
      const layout = (
        await http()
          .post(`${org}/seat-layouts`)
          .set('Authorization', owner.auth)
          .send(presetLayout('sleeper_2_1'))
          .expect(201)
      ).body as SeatLayout;
      const route = (
        await http()
          .post(`${org}/routes`)
          .set('Authorization', owner.auth)
          .send({
            name: 'Caracas – Maracaibo',
            stops: [
              { stopId: caracas.id, minutesFromOrigin: 0 },
              { stopId: valencia.id, minutesFromOrigin: 150 },
              { stopId: maracaibo.id, minutesFromOrigin: 630 },
            ],
          })
          .expect(201)
      ).body as Route;
      const routeUrl = `${org}/routes/${route.id}`;
      await http()
        .put(`${routeUrl}/fares`)
        .set('Authorization', owner.auth)
        .send({
          fares: [
            { fromStopId: caracas.id, toStopId: maracaibo.id, amount: '20', currency: 'USD' },
          ],
        })
        .expect(200);
      const today = todayInVenezuela();
      const scheduled = (
        await http()
          .post(`${routeUrl}/schedules`)
          .set('Authorization', owner.auth)
          .send({
            departureTime: '23:00',
            daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
            validFrom: today,
            serviceClass: 'sleeper',
            seatLayoutId: layout.id,
          })
          .expect(201)
      ).body as Route;
      const scheduleId = scheduled.schedules[0]!.id;
      await http()
        .post(`${routeUrl}/status`)
        .set('Authorization', owner.auth)
        .send({ status: 'active' })
        .expect(200);
      const date = addDays(today, 2);

      // --- Public availability.
      const availability = (query: object) => http().get('/api/v1/trips/availability').query(query);
      const trip = { scheduleId, serviceDate: date, from: caracas.id, to: maracaibo.id };
      const before = (await availability(trip).expect(200)).body as TripAvailability;
      expect(before).toMatchObject({
        capacity: 30,
        takenSeats: [],
        fare: { amount: '20.00', currency: 'USD' },
        bookable: true,
        departsAt: `${date}T23:00:00-04:00`,
        arrivesAt: `${addDays(date, 1)}T09:30:00-04:00`,
      });
      expect(before.layout?.seats).toHaveLength(30);
      await availability({ ...trip, from: maracaibo.id, to: caracas.id }).expect(404);
      await availability({ ...trip, serviceDate: addDays(today, -1) }).expect(404);
      // Segment without a fare: visible but not bookable online.
      const segment = (await availability({ ...trip, to: valencia.id }).expect(200))
        .body as TripAvailability;
      expect(segment).toMatchObject({ fare: null, bookable: false });

      // --- Holding seats.
      const book = (auth: string, seats: string[], extra: object = {}) =>
        http()
          .post('/api/v1/bookings')
          .set('Authorization', auth)
          .send({
            scheduleId,
            serviceDate: date,
            fromStopId: caracas.id,
            toStopId: maracaibo.id,
            passengers: seats.map((seat) => passenger(seat)),
            ...extra,
          });
      const ana = await signIn();
      await http().post('/api/v1/bookings').send({}).expect(401);
      await book(ana.auth, ['99']).expect(400);
      await book(ana.auth, ['1', '1']).expect(400);
      await book(ana.auth, ['1', '2', '3', '4', '5', '6', '7']).expect(400);
      await book(ana.auth, ['1'], { toStopId: valencia.id }).expect(409);

      const held = (await book(ana.auth, ['1', '2']).expect(201)).body as Booking;
      expect(held).toMatchObject({
        status: 'held',
        total: { amount: '40.00', currency: 'USD' },
        trip: { serviceDate: date, departsAt: `${date}T23:00:00-04:00`, serviceClass: 'sleeper' },
      });
      expect(held.code).toMatch(/^VTP-[A-Z2-9]{6}$/);
      expect(held.passengers.map((p) => [p.seatNumber, p.fare])).toEqual([
        ['1', '20.00'],
        ['2', '20.00'],
      ]);
      const holdMs = Date.parse(held.expiresAt!) - Date.now();
      expect(holdMs).toBeGreaterThan(14 * 60_000);
      expect(holdMs).toBeLessThanOrEqual(15 * 60_000 + 5_000);

      const luis = await signIn();
      const taken = await book(luis.auth, ['2', '3']).expect(409);
      expect(taken.body.error.message).toMatch(/just taken/);
      expect(taken.body.error.reason).toBe('SEAT_TAKEN');

      // Two people racing for the same seat: exactly one wins.
      const [maria, pedro] = [await signIn(), await signIn()];
      const race = await Promise.all([book(maria.auth, ['5']), book(pedro.auth, ['5'])]);
      expect(race.map((r) => r.status).sort()).toEqual([201, 409]);

      const after = (await availability(trip).expect(200)).body as TripAvailability;
      expect(after.takenSeats).toEqual(['1', '2', '5']);
      const search = (
        await http()
          .get('/api/v1/search/departures')
          .query({ from: caracas.id, to: maracaibo.id, date })
          .expect(200)
      ).body as Departure[];
      expect(search.find((d) => d.scheduleId === scheduleId)).toMatchObject({
        seats: 30,
        seatsAvailable: 27,
      });

      // Editing the map later does not change a trip that already exists.
      await http()
        .patch(`${org}/seat-layouts/${layout.id}`)
        .set('Authorization', owner.auth)
        .send({ seats: presetLayout('sleeper_2_1').seats.slice(0, 20) })
        .expect(200);
      expect(((await availability(trip).expect(200)).body as TripAvailability).capacity).toBe(30);

      // --- Expiry frees the seats.
      await db
        .update(bookings)
        .set({ expiresAt: sql`now() - interval '1 minute'` })
        .where(eq(bookings.id, held.id));
      expect(((await availability(trip).expect(200)).body as TripAvailability).takenSeats).toEqual([
        '5',
      ]);
      const mine = (
        await http().get('/api/v1/me/bookings').set('Authorization', ana.auth).expect(200)
      ).body as Booking[];
      expect(mine.map((b) => [b.id, b.status])).toEqual([[held.id, 'expired']]);
      expect(mine[0]!.expiresAt).toBeNull();
      const rebooked = (await book(luis.auth, ['1']).expect(201)).body as Booking;

      // --- Cancelling.
      await http()
        .get(`/api/v1/me/bookings/${rebooked.id}`)
        .set('Authorization', ana.auth)
        .expect(404);
      const cancelled = (
        await http()
          .post(`/api/v1/me/bookings/${rebooked.id}/cancel`)
          .set('Authorization', luis.auth)
          .expect(200)
      ).body as Booking;
      expect(cancelled.status).toBe('cancelled');
      await http()
        .post(`/api/v1/me/bookings/${rebooked.id}/cancel`)
        .set('Authorization', luis.auth)
        .expect(409);
      expect(((await availability(trip).expect(200)).body as TripAvailability).takenSeats).toEqual([
        '5',
      ]);

      // --- At most three unpaid holds per person.
      for (const seat of ['10', '11', '12']) await book(luis.auth, [seat]).expect(201);
      const hoarding = await book(luis.auth, ['13']).expect(409);
      expect(hoarding.body.error.message).toMatch(/pending bookings/);

      // --- Operator views: trips of the day and the passenger list.
      const trips = (
        await http()
          .get(`${org}/trips`)
          .query({ date })
          .set('Authorization', owner.auth)
          .expect(200)
      ).body as TripSummary[];
      expect(trips).toEqual([
        expect.objectContaining({
          scheduleId,
          serviceDate: date,
          departureTime: '23:00',
          capacity: 30,
          heldSeats: 4,
          soldSeats: 0,
        }),
      ]);
      const manifest = (
        await http()
          .get(`${org}/trips/${trips[0]!.id}/manifest`)
          .set('Authorization', owner.auth)
          .expect(200)
      ).body as TripManifest;
      expect(manifest.passengers.map((p) => p.seatNumber)).toEqual(['5', '10', '11', '12']);
      expect(manifest.passengers[0]).toMatchObject({
        lastName: `Viajera ${run}`,
        documentType: 'V',
        bookingStatus: 'held',
        from: expect.objectContaining({ id: caracas.id }),
      });

      // Drivers do not see passenger data; other organizations get 404.
      const driver = await signIn();
      await http()
        .post(`${org}/invitations`)
        .set('Authorization', owner.auth)
        .send({ contactKind: 'email', destination: driver.email, role: 'driver' })
        .expect(201);
      const [invitation] = (
        await http().get('/api/v1/me/invitations').set('Authorization', driver.auth).expect(200)
      ).body as ReceivedInvitation[];
      await http()
        .post(`/api/v1/me/invitations/${invitation!.id}/accept`)
        .set('Authorization', driver.auth)
        .expect(204);
      await http()
        .get(`${org}/trips`)
        .query({ date })
        .set('Authorization', driver.auth)
        .expect(403);
      await http()
        .get(`${org}/trips/${trips[0]!.id}/manifest`)
        .set('Authorization', ana.auth)
        .expect(404);

      // A schedule with bookings is paused, not deleted.
      await http()
        .delete(`${routeUrl}/schedules/${scheduleId}`)
        .set('Authorization', owner.auth)
        .expect(409);
    },
  );
});
