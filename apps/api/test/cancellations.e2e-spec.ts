import { randomInt, randomUUID } from 'node:crypto';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import {
  todayInVenezuela,
  type AuthResponse,
  type Booking,
  type CancellationQuote,
  type OrganizationMembershipSummary,
  type OrganizationSettlement,
  type OtpChallengeResponse,
  type Payment,
  type RefundDuePayment,
  type Route,
  type Stop,
} from '@vtp/shared-types';
import { and, eq, sql } from 'drizzle-orm';
import request from 'supertest';
import { DatabaseService } from '../src/database/database.service.js';
import { bookings, trips } from '../src/modules/bookings/bookings.schema.js';
import { users } from '../src/modules/identity/identity.schema.js';
import { settlementEntries } from '../src/modules/settlements/settlements.schema.js';
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

describe.runIf(expectDatabase)('Cancelling paid bookings (e2e)', () => {
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

  const signIn = async (email = `cancel-e2e-${randomUUID()}@example.com`) => {
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
    'refunds by the tiers, keeps the commission, frees the seats and stops once boarded',
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
            legalName: `Cancelaciones ${run}`,
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
      const settlement = async (auth = owner.auth) =>
        (await http().get(`${org}/settlement`).set('Authorization', auth).expect(200))
          .body as OrganizationSettlement;

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
      const payWith = async (booking: Booking, method: string) => {
        const payment = (
          await http()
            .post(`/api/v1/me/bookings/${booking.id}/payments`)
            .set('Authorization', passenger.auth)
            .send({ method })
            .expect(201)
        ).body as Payment;
        await http()
          .post(`/api/v1/me/payments/${payment.id}/simulate`)
          .set('Authorization', passenger.auth)
          .send({})
          .expect(200);
        return payment;
      };
      const departsIn = (booking: Booking, interval: string) =>
        db
          .update(bookings)
          .set({ departsAt: sql`now() + ${interval}::interval` })
          .where(eq(bookings.id, booking.id));
      const quote = (booking: Booking) =>
        http()
          .get(`/api/v1/me/bookings/${booking.id}/cancellation`)
          .set('Authorization', passenger.auth);
      const cancel = (booking: Booking) =>
        http()
          .post(`/api/v1/me/bookings/${booking.id}/cancel`)
          .set('Authorization', passenger.auth);
      const cancellationEntry = async (bookingId: string) =>
        (
          await db
            .select()
            .from(settlementEntries)
            .where(
              and(
                eq(settlementEntries.bookingId, bookingId),
                eq(settlementEntries.kind, 'cancellation'),
              ),
            )
        )[0];

      // --- Three days ahead: everything back. US$ 25 paid as Bs. 912,50 by pago móvil.
      const early = await book(['1']);
      // The passenger sees the operator's tiers before paying.
      expect(early.refundPolicy).toEqual([
        { hoursBefore: 48, percent: 100 },
        { hoursBefore: 2, percent: 50 },
      ]);
      await quote(early).expect(409); // held: no refund quote, it is simply cancelled
      const earlyPayment = await payWith(early, 'pago_movil');
      expect((await quote(early).expect(200)).body).toMatchObject({
        cancellable: true,
        refundPercent: 100,
        refund: { amount: '912.50', currency: 'VES' },
        policy: [
          { hoursBefore: 48, percent: 100 },
          { hoursBefore: 2, percent: 50 },
        ],
      });
      // Other passengers cannot see or cancel it.
      const stranger = await signIn();
      await http()
        .get(`/api/v1/me/bookings/${early.id}/cancellation`)
        .set('Authorization', stranger.auth)
        .expect(404);
      const cancelledEarly = (await cancel(early).expect(200)).body as Booking;
      expect(cancelledEarly).toMatchObject({
        status: 'cancelled',
        payment: { id: earlyPayment.id, status: 'refund_due', refundAmount: '912.50' },
      });
      // The tiers refund the fare (25.00, Bs. 912,50 of the Bs. 985,50 paid); the 2.00 service
      // fee paid on top is not refunded (ADR-029), so the operator gives back exactly its fare.
      expect(earlyPayment.amount).toBe('985.50');
      expect(await cancellationEntry(early.id)).toMatchObject({
        seats: -1,
        gross: '-25.00',
        commissionRate: '8.00',
        commission: '0.00',
        earned: '-25.00',
      });
      await cancel(early).expect(409);
      // The seat is free again.
      const again = await book(['1']);

      // --- Ten hours before: half the fare back; the operator keeps 25 - 12.50 = 12.50.
      const late = await book(['2']);
      await payWith(late, 'usdt');
      await departsIn(late, '10 hours');
      expect((await quote(late).expect(200)).body).toMatchObject({
        cancellable: true,
        refundPercent: 50,
        refund: { amount: '12.50', currency: 'USDT' },
      });
      expect((await cancel(late).expect(200)).body).toMatchObject({
        status: 'cancelled',
        payment: { status: 'refund_due', refundAmount: '12.50' },
      });
      expect(await cancellationEntry(late.id)).toMatchObject({
        gross: '-12.50',
        commission: '0.00',
        earned: '-12.50',
      });

      // --- One hour before: nothing back, but the seat is still released.
      const lastMinute = await book(['3']);
      const lastPayment = await payWith(lastMinute, 'usdt');
      await departsIn(lastMinute, '1 hour');
      expect((await quote(lastMinute).expect(200)).body).toMatchObject({
        cancellable: true,
        refundPercent: 0,
        refund: null,
      });
      expect((await cancel(lastMinute).expect(200)).body).toMatchObject({
        status: 'cancelled',
        payment: { id: lastPayment.id, status: 'confirmed', refundAmount: null },
      });
      expect(await cancellationEntry(lastMinute.id)).toBeUndefined();

      // --- Once a passenger boarded, or the bus left, it cannot be cancelled.
      const boarded = await book(['4']);
      await payWith(boarded, 'usdt');
      await departsIn(boarded, '30 minutes');
      const [ticket] = (
        (
          await http()
            .get(`/api/v1/me/bookings/${boarded.id}`)
            .set('Authorization', passenger.auth)
            .expect(200)
        ).body as Booking
      ).passengers;
      await http()
        .post(`${org}/tickets/validate`)
        .set('Authorization', owner.auth)
        .send({ qr: ticket!.ticket!.qr })
        .expect(200);
      expect((await quote(boarded).expect(200)).body).toMatchObject({
        cancellable: false,
        refundPercent: 0,
      });
      await cancel(boarded)
        .expect(409)
        .expect((res) => expect(res.body.error.reason).toBe('BOOKING_NOT_CANCELLABLE'));
      const gone = await book(['5']);
      await payWith(gone, 'usdt');
      await departsIn(gone, '-1 hour');
      expect(((await quote(gone).expect(200)).body as CancellationQuote).cancellable).toBe(false);
      await cancel(gone).expect(409);

      // --- The operator's balance: 5 paid bookings (25.00 fare + 2.00 service fee each), minus
      // the full fare refund (25.00) and the half one (12.50). The fees stay with the platform.
      expect((await settlement()).balances).toEqual([
        {
          currency: 'USD',
          gross: '97.50',
          commission: '10.00',
          earned: '87.50',
          collected: '0.00',
          paidOut: '0.00',
          received: '0.00',
          balance: '87.50',
        },
      ]);
      void again;

      // Once the driver marked the departure, it cannot be cancelled even before boarding time.
      const leftEarly = await book(['6']);
      await payWith(leftEarly, 'usdt');
      await db
        .update(trips)
        .set({ departedAt: sql`now()` })
        .where(eq(trips.id, leftEarly.trip.id));
      expect(((await quote(leftEarly).expect(200)).body as CancellationQuote).cancellable).toBe(
        false,
      );
      await cancel(leftEarly).expect(409);
      await db.update(trips).set({ departedAt: null }).where(eq(trips.id, leftEarly.trip.id));

      // --- The admins' refund queue shows what goes back after a cancellation.
      const queue = (
        await http().get('/api/v1/admin/refunds').set('Authorization', admin.auth).expect(200)
      ).body as RefundDuePayment[];
      expect(queue.find((r) => r.paymentId === earlyPayment.id)).toMatchObject({
        cancellation: true,
        // Paid 985.50 (fare + service fee); the fare is refunded.
        amount: '985.50',
        refundAmount: '912.50',
        currency: 'VES',
      });

      // === The operator cancels a whole departure (another day) ===
      const otherDay = addDays(today, 4);
      const scheduleId = scheduled.schedules[0]!.id;
      const bookOn = async (seats: string[]) =>
        (
          await http()
            .post('/api/v1/bookings')
            .set('Authorization', passenger.auth)
            .send({
              scheduleId,
              serviceDate: otherDay,
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
      const search = async () =>
        (
          await http()
            .get(`/api/v1/search/departures?from=${valencia.id}&to=${merida.id}&date=${otherDay}`)
            .expect(200)
        ).body as { scheduleId: string }[];
      expect((await search()).some((d) => d.scheduleId === scheduleId)).toBe(true);
      const paidOne = await bookOn(['1', '2']);
      await payWith(paidOne, 'usdt');
      const heldOne = await bookOn(['3']);
      const cancelDeparture = (auth: string, reason = 'La unidad tuvo una falla mecánica.') =>
        http()
          .post(`${org}/dispatch/cancel`)
          .set('Authorization', auth)
          .send({ scheduleId, serviceDate: otherDay, reason });
      await cancelDeparture(passenger.auth).expect(404);
      await cancelDeparture(owner.auth, 'no').expect(400);
      expect((await cancelDeparture(owner.auth).expect(200)).body).toMatchObject({
        tripId: paidOne.trip.id,
        cancelledBookings: 2,
        refundsDue: 1,
      });
      await cancelDeparture(owner.auth)
        .expect(409)
        .expect((res) => expect(res.body.error.reason).toBe('TRIP_CANCELLED'));

      // Paid: refunded in full, fares and service fee (54.00); the platform keeps its fee, so the
      // operator pays it (ADR-029).
      const paidView = (
        await http()
          .get(`/api/v1/me/bookings/${paidOne.id}`)
          .set('Authorization', passenger.auth)
          .expect(200)
      ).body as Booking;
      expect(paidView).toMatchObject({
        status: 'cancelled',
        trip: { cancellation: { reason: 'La unidad tuvo una falla mecánica.' } },
        payment: { status: 'refund_due', refundAmount: '54.00', currency: 'USDT' },
      });
      expect(
        await db
          .select({
            gross: settlementEntries.gross,
            commission: settlementEntries.commission,
            earned: settlementEntries.earned,
          })
          .from(settlementEntries)
          .where(
            and(
              eq(settlementEntries.bookingId, paidOne.id),
              eq(settlementEntries.kind, 'cancellation'),
            ),
          ),
      ).toEqual([{ gross: '-54.00', commission: '0.00', earned: '-54.00' }]);
      const heldView = (
        await http()
          .get(`/api/v1/me/bookings/${heldOne.id}`)
          .set('Authorization', passenger.auth)
          .expect(200)
      ).body as Booking;
      expect(heldView.status).toBe('cancelled');

      // No longer sold, searched or listed as bookable.
      expect((await search()).some((d) => d.scheduleId === scheduleId)).toBe(false);
      await http()
        .post('/api/v1/bookings')
        .set('Authorization', passenger.auth)
        .send({
          scheduleId,
          serviceDate: otherDay,
          fromStopId: valencia.id,
          toStopId: merida.id,
          passengers: [
            {
              seatNumber: '9',
              firstName: 'Rosa',
              lastName: 'Tarde',
              documentType: 'V',
              documentNumber: '12345678',
            },
          ],
        })
        .expect(409);
      const board = (
        await http()
          .get(`${org}/dispatch?date=${otherDay}`)
          .set('Authorization', owner.auth)
          .expect(200)
      ).body as { departures: { scheduleId: string; cancellation: unknown }[] };
      expect(board.departures.find((d) => d.scheduleId === scheduleId)?.cancellation).toMatchObject(
        { reason: 'La unidad tuvo una falla mecánica.' },
      );
    },
  );
});
