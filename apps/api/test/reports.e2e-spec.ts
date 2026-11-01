import { randomInt, randomUUID } from 'node:crypto';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import {
  todayInVenezuela,
  type AuthResponse,
  type Booking,
  type OccupancyReport,
  type PlatformMetrics,
  type SalesReport,
  type OrganizationMembershipSummary,
  type OtpChallengeResponse,
  type Payment,
  type Route,
  type Stop,
} from '@vtp/shared-types';
import { eq, sql } from 'drizzle-orm';
import request from 'supertest';
import { DatabaseService } from '../src/database/database.service.js';
import { bookings } from '../src/modules/bookings/bookings.schema.js';
import { users } from '../src/modules/identity/identity.schema.js';
import type { OtpMessage, OtpSender } from '../src/modules/identity/otp/otp-sender.js';
import { addDays } from '../src/modules/network/departures.js';

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

describe.runIf(expectDatabase)('Reports (e2e)', () => {
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

  const signIn = async (email = `reports-e2e-${randomUUID()}@example.com`) => {
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
    'reports sales net of cancellations, occupancy per departure and platform metrics',
    { timeout: 30_000 },
    async () => {
      const db = app.get(DatabaseService).db;
      const staff = async (role: 'admin' | 'reviewer') => {
        const user = await signIn();
        await db.update(users).set({ platformRole: role }).where(eq(users.id, user.user.id));
        return user;
      };
      const [admin, reviewer] = [await staff('admin'), await staff('reviewer')];

      // --- Setup: an approved bus company with a route priced in dollars.
      const stop = async (name: string) =>
        (
          await http()
            .post('/api/v1/admin/stops')
            .set('Authorization', reviewer.auth)
            .send({ kind: 'terminal', name: `${name} ${run}`, city: name, state: 'Estado' })
            .expect(201)
        ).body as Stop;
      const [valencia, merida] = [await stop('Valencia'), await stop('Mérida')];
      const owner = await signIn();
      const { organization } = (
        await http()
          .post('/api/v1/organizations')
          .set('Authorization', owner.auth)
          .send({
            type: 'bus_company',
            legalName: `Reportes ${run}`,
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
      const route = (
        await http()
          .post(`${org}/routes`)
          .set('Authorization', owner.auth)
          .send({
            name: 'Valencia – Mérida',
            stops: [
              { stopId: valencia.id, minutesFromOrigin: 0 },
              { stopId: merida.id, minutesFromOrigin: 600 },
            ],
          })
          .expect(201)
      ).body as Route;
      const routeUrl = `${org}/routes/${route.id}`;
      await http()
        .put(`${routeUrl}/fares`)
        .set('Authorization', owner.auth)
        .send({
          fares: [{ fromStopId: valencia.id, toStopId: merida.id, amount: '25', currency: 'USD' }],
        })
        .expect(200);
      const today = todayInVenezuela();
      const scheduled = (
        await http()
          .post(`${routeUrl}/schedules`)
          .set('Authorization', owner.auth)
          .send({
            departureTime: '21:00',
            daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
            validFrom: today,
            serviceClass: 'standard',
            seats: 40,
          })
          .expect(201)
      ).body as Route;
      await http()
        .post(`${routeUrl}/status`)
        .set('Authorization', owner.auth)
        .send({ status: 'active' })
        .expect(200);
      const date = addDays(today, 3);
      const passenger = await signIn();
      const book = async (seats: string[]) =>
        (
          await http()
            .post('/api/v1/bookings')
            .set('Authorization', passenger.auth)
            .send({
              scheduleId: scheduled.schedules[0]!.id,
              serviceDate: date,
              fromStopId: valencia.id,
              toStopId: merida.id,
              passengers: seats.map((seatNumber) => ({
                seatNumber,
                firstName: 'Rosa',
                lastName: `Pasajera ${run}`,
                documentType: 'V',
                documentNumber: `${randomInt(10_000_000, 30_000_000)}`,
              })),
            })
            .expect(201)
        ).body as Booking;
      // This operator's own policy, so the test does not depend on the platform default.
      await http()
        .put(`/api/v1/admin/organizations/${organization.id}/policy`)
        .set('Authorization', admin.auth)
        .send({
          commissionRate: '8',
          refundTiers: [
            { hoursBefore: 48, percent: 100 },
            { hoursBefore: 2, percent: 50 },
          ],
        })
        .expect(200);
      await http()
        .put(`${org}/exchange-rates`)
        .set('Authorization', owner.auth)
        .send({ rates: [{ currency: 'VES', unitsPerUsd: '36.5' }] })
        .expect(200);
      const payWith = async (booking: Booking) => {
        const payment = (
          await http()
            .post(`/api/v1/me/bookings/${booking.id}/payments`)
            .set('Authorization', passenger.auth)
            .send({ method: 'usdt' })
            .expect(201)
        ).body as Payment;
        await http()
          .post(`/api/v1/me/payments/${payment.id}/simulate`)
          .set('Authorization', passenger.auth)
          .send({})
          .expect(200);
      };
      const reportsUrl = `${org}/reports`;
      const range = { from: today, to: today };

      // --- Two seats paid and kept; one seat paid and cancelled three days ahead (100 % back).
      const kept = await book(['1', '2']);
      await payWith(kept);
      const dropped = await book(['3']);
      await payWith(dropped);
      await http()
        .post(`/api/v1/me/bookings/${dropped.id}/cancel`)
        .set('Authorization', passenger.auth)
        .expect(200);
      // One passenger of the kept booking boards (moved close to departure to allow it).
      await db
        .update(bookings)
        .set({ departsAt: sql`now() + interval '30 minutes'` })
        .where(eq(bookings.id, kept.id));
      const [first] = (
        (
          await http()
            .get(`/api/v1/me/bookings/${kept.id}`)
            .set('Authorization', passenger.auth)
            .expect(200)
        ).body as Booking
      ).passengers;
      await http()
        .post(`${org}/tickets/validate`)
        .set('Authorization', owner.auth)
        .send({ qr: first!.ticket!.qr })
        .expect(200);

      // --- Sales: paid minus cancelled, with the platform's default commission (8 % unless an
      // admin changed it; read it to stay independent).
      const sales = (
        await http()
          .get(`${reportsUrl}/sales`)
          .query(range)
          .set('Authorization', owner.auth)
          .expect(200)
      ).body as SalesReport;
      const policy = (
        await http().get(`${org}/settlement`).set('Authorization', owner.auth).expect(200)
      ).body as { commissionRate: string };
      const commissionPerSeat = (25 * Number(policy.commissionRate)) / 100;
      expect(sales.totals).toEqual([
        {
          currency: 'USD',
          bookings: 2,
          seats: 2,
          gross: '50.00',
          commission: (2 * commissionPerSeat).toFixed(2),
          earned: (50 - 2 * commissionPerSeat).toFixed(2),
          cancellations: 1,
          refunded: '25.00',
        },
      ]);
      expect(sales.byRoute).toEqual([
        expect.objectContaining({ route: { id: route.id, name: 'Valencia – Mérida' }, seats: 2 }),
      ]);
      expect(sales.byDay).toEqual([expect.objectContaining({ date: today, gross: '50.00' })]);

      // --- Occupancy: by service date of the departure.
      const occupancy = (
        await http()
          .get(`${reportsUrl}/occupancy`)
          .query({ from: today, to: addDays(today, 7) })
          .set('Authorization', owner.auth)
          .expect(200)
      ).body as OccupancyReport;
      expect(occupancy.departures).toEqual([
        expect.objectContaining({
          route: { id: route.id, name: 'Valencia – Mérida' },
          capacity: 40,
          soldSeats: 2,
          boardedSeats: 1,
          occupancy: 5,
        }),
      ]);
      expect(occupancy.byRoute).toEqual([
        expect.objectContaining({ departures: 1, soldSeats: 2, occupancy: 5 }),
      ]);

      // --- Ranges and permissions.
      await http()
        .get(`${reportsUrl}/sales`)
        .query({ from: today, to: addDays(today, -1) })
        .set('Authorization', owner.auth)
        .expect(400);
      await http()
        .get(`${reportsUrl}/sales`)
        .query({ from: addDays(today, -400), to: today })
        .set('Authorization', owner.auth)
        .expect(400);
      await http().get(`${reportsUrl}/sales`).set('Authorization', passenger.auth).expect(404);

      // --- Platform metrics: admins only.
      await http().get('/api/v1/admin/metrics').set('Authorization', reviewer.auth).expect(403);
      const metrics = (
        await http()
          .get('/api/v1/admin/metrics')
          .query(range)
          .set('Authorization', admin.auth)
          .expect(200)
      ).body as PlatformMetrics;
      expect(metrics.sales.find((s) => s.currency === 'USD')!.cancellations).toBeGreaterThanOrEqual(
        1,
      );
      expect(metrics.refundsPending).toBeGreaterThanOrEqual(1);
      expect(metrics.newUsers).toBeGreaterThanOrEqual(3);
      expect(metrics.activeOrganizations.bus_company).toBeGreaterThanOrEqual(1);
      expect(metrics.taxiRides).toEqual({
        requested: expect.any(Number),
        completed: expect.any(Number),
        cancelledOrExpired: expect.any(Number),
      });
    },
  );
});
