import { randomInt, randomUUID } from 'node:crypto';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import {
  todayInVenezuela,
  type AdminSettlementSummary,
  type AuthResponse,
  type Booking,
  type OrganizationMembershipSummary,
  type OrganizationSettlement,
  type OtpChallengeResponse,
  type Payment,
  type Payout,
  type RefundDuePayment,
  type Route,
  type SettlementEntry,
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

describe.runIf(expectDatabase)('Settlements and refunds (e2e)', () => {
  let app: NestExpressApplication;
  const otp = new CapturingOtpSender();
  const http = () => request(app.getHttpServer());
  const run = randomUUID().slice(0, 8);

  beforeAll(async () => {
    process.env.AUTH_RATE_LIMIT_MAX = '1000';
    process.env.RATE_LIMIT_MAX = '10000';
    process.env.OTP_RESEND_SECONDS = '0';
    process.env.OTP_MAX_PER_HOUR = '100';
    process.env.PLATFORM_COMMISSION_PERCENT = '10';
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
    delete process.env.PLATFORM_COMMISSION_PERCENT;
    await app?.close();
  });

  const signIn = async (email = `settle-e2e-${randomUUID()}@example.com`) => {
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
    'earns fares minus commission, records and voids payouts, and clears refunds',
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
            legalName: `Liquidaciones ${run}`,
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
      const payUsdt = async (booking: Booking, amount?: string) => {
        const payment = (
          await http()
            .post(`/api/v1/me/bookings/${booking.id}/payments`)
            .set('Authorization', passenger.auth)
            .send({ method: 'usdt' })
            .expect(201)
        ).body as Payment;
        const after = (
          await http()
            .post(`/api/v1/me/payments/${payment.id}/simulate`)
            .set('Authorization', passenger.auth)
            .send(amount ? { amount } : {})
            .expect(200)
        ).body as Booking;
        return { payment, booking: after };
      };
      const settlement = async (auth = owner.auth) =>
        (await http().get(`${org}/settlement`).set('Authorization', auth).expect(200))
          .body as OrganizationSettlement;

      // --- Nothing earned yet: the platform default applies.
      expect(await settlement()).toEqual({
        organizationId: organization.id,
        commissionRate: '10.00',
        commissionOverride: null,
        balances: [],
      });
      // Active bus companies are listed for the admins before their first sale.
      expect(
        (
          (
            await http()
              .get('/api/v1/admin/settlements')
              .set('Authorization', admin.auth)
              .expect(200)
          ).body as AdminSettlementSummary[]
        ).find((s) => s.organization.id === organization.id),
      ).toMatchObject({ commissionRate: '10.00', balances: [] });
      // Non-members do not see it; platform reviewers cannot touch money.
      await http().get(`${org}/settlement`).set('Authorization', passenger.auth).expect(404);
      await http().get('/api/v1/admin/settlements').set('Authorization', reviewer.auth).expect(403);

      // --- Two seats paid at the default 10 %: 50.00 gross, 5.00 commission, 45.00 earned.
      const first = await payUsdt(await book(['1', '2']));
      expect(first.booking.status).toBe('confirmed');
      // A repeated notification does not earn twice.
      await http()
        .post(`/api/v1/me/payments/${first.payment.id}/simulate`)
        .set('Authorization', passenger.auth)
        .send({})
        .expect(200);

      // --- An agreed commission for this operator applies to bookings paid from then on.
      const commission = (rate: string | null | number, auth = admin.auth) =>
        http()
          .put(`/api/v1/admin/organizations/${organization.id}/commission`)
          .set('Authorization', auth)
          .send({ rate });
      await commission('8.5', reviewer.auth).expect(403);
      await commission('101').expect(400);
      await commission('8.555').expect(400);
      await commission(8).expect(400);
      await commission('8.5', admin.auth)
        .expect(200)
        .expect((res) =>
          expect(res.body).toMatchObject({ commissionRate: '8.50', commissionOverride: '8.50' }),
        );
      await payUsdt(await book(['3']));

      expect((await settlement()).balances).toEqual([
        {
          currency: 'USD',
          gross: '75.00',
          commission: '7.13',
          earned: '67.87',
          paidOut: '0.00',
          balance: '67.87',
        },
      ]);
      const entries = (
        await http().get(`${org}/settlement/entries`).set('Authorization', owner.auth).expect(200)
      ).body as SettlementEntry[];
      expect(
        entries.map((e) => [e.seats, e.gross, e.commissionRate, e.commission, e.earned]),
      ).toEqual([
        [1, '25.00', '8.50', '2.13', '22.87'],
        [2, '50.00', '10.00', '5.00', '45.00'],
      ]);
      expect(entries[0]).toMatchObject({ route: { id: route.id }, serviceDate: date });
      await http()
        .get(`${org}/settlement/entries`)
        .query({ month: '2026-13' })
        .set('Authorization', owner.auth)
        .expect(400);
      expect(
        (
          await http()
            .get(`${org}/settlement/entries`)
            .query({ month: '2001-01' })
            .set('Authorization', owner.auth)
            .expect(200)
        ).body,
      ).toEqual([]);

      // --- Payouts: never more than the balance in that currency; voided ones give it back.
      const payout = (body: object, auth = admin.auth) =>
        http()
          .post(`/api/v1/admin/organizations/${organization.id}/payouts`)
          .set('Authorization', auth)
          .send({ method: 'bank_transfer', reference: 'TRF-001', ...body });
      await payout({ currency: 'USD', amount: '10' }, reviewer.auth).expect(403);
      await payout({ currency: 'USD', amount: '0' }).expect(400);
      await payout({ currency: 'EUR', amount: '10' }).expect(400);
      await payout({ currency: 'VES', amount: '1' })
        .expect(409)
        .expect((res) => expect(res.body.error.reason).toBe('PAYOUT_EXCEEDS_BALANCE'));
      await payout({ currency: 'USD', amount: '67.88' }).expect(409);
      const wrong = (await payout({ currency: 'USD', amount: '60' }).expect(201)).body as Payout;
      expect(wrong).toMatchObject({ amount: '60.00', currency: 'USD', voidedAt: null });
      expect((await settlement()).balances[0]).toMatchObject({
        paidOut: '60.00',
        balance: '7.87',
      });
      const voidPayout = (id: string) =>
        http()
          .post(`/api/v1/admin/payouts/${id}/void`)
          .set('Authorization', admin.auth)
          .send({ reason: 'Monto equivocado' });
      expect(((await voidPayout(wrong.id).expect(200)).body as Payout).voidedAt).not.toBeNull();
      await voidPayout(wrong.id)
        .expect(409)
        .expect((res) => expect(res.body.error.reason).toBe('PAYOUT_ALREADY_VOIDED'));
      await voidPayout(randomUUID()).expect(404);
      await payout({ currency: 'USD', amount: '67.87', note: 'Semana 44' }).expect(201);
      expect((await settlement()).balances[0]).toMatchObject({
        paidOut: '67.87',
        balance: '0.00',
      });
      const history = (
        await http().get(`${org}/payouts`).set('Authorization', owner.auth).expect(200)
      ).body as Payout[];
      expect(history.map((p) => [p.amount, p.voidedAt !== null, p.note])).toEqual([
        ['67.87', false, 'Semana 44'],
        ['60.00', true, null],
      ]);

      // --- The admin overview lists the operator with its balance.
      const overview = (
        await http().get('/api/v1/admin/settlements').set('Authorization', admin.auth).expect(200)
      ).body as AdminSettlementSummary[];
      expect(overview.find((s) => s.organization.id === organization.id)).toMatchObject({
        organization: { name: `Liquidaciones ${run}`, type: 'bus_company' },
        commissionOverride: '8.50',
        balances: [{ currency: 'USD', balance: '0.00' }],
      });

      expect(
        (
          await http()
            .get(`/api/v1/admin/organizations/${organization.id}/settlement`)
            .set('Authorization', admin.auth)
            .expect(200)
        ).body,
      ).toMatchObject({ organization: { id: organization.id }, commissionRate: '8.50' });
      await http()
        .get(`/api/v1/admin/organizations/${randomUUID()}/settlement`)
        .set('Authorization', admin.auth)
        .expect(404);

      // Back to the default: new bookings pay 10 % again; earned entries keep their rate.
      await commission(null).expect(200);
      expect(await settlement()).toMatchObject({
        commissionRate: '10.00',
        commissionOverride: null,
      });

      // --- Refunds: short money is refunded; platform admins mark it as sent back.
      const short = await payUsdt(await book(['4']), '5.00');
      expect(short.booking.payment).toMatchObject({ status: 'refund_due' });
      const queue = (
        await http().get('/api/v1/admin/refunds').set('Authorization', admin.auth).expect(200)
      ).body as RefundDuePayment[];
      expect(queue.find((r) => r.paymentId === short.payment.id)).toMatchObject({
        bookingCode: short.booking.code,
        organization: { id: organization.id },
        payer: { email: passenger.email },
        method: 'usdt',
        amount: '25.00',
        receivedAmount: '5.00',
      });
      const refund = (paymentId: string, auth = admin.auth) =>
        http()
          .post(`/api/v1/admin/refunds/${paymentId}`)
          .set('Authorization', auth)
          .send({ reference: '0xREFUND' });
      await refund(short.payment.id, reviewer.auth).expect(403);
      await refund(first.payment.id)
        .expect(409)
        .expect((res) => expect(res.body.error.reason).toBe('PAYMENT_NOT_REFUND_DUE'));
      await refund(randomUUID()).expect(404);
      await refund(short.payment.id).expect(204);
      await refund(short.payment.id).expect(409);
      const queueAfter = (
        await http().get('/api/v1/admin/refunds').set('Authorization', admin.auth).expect(200)
      ).body as RefundDuePayment[];
      expect(queueAfter.some((r) => r.paymentId === short.payment.id)).toBe(false);

      // The passenger sees the refund once the booking is no longer held.
      await db
        .update(bookings)
        .set({ status: 'expired', expiresAt: sql`now() - interval '1 minute'` })
        .where(eq(bookings.id, short.booking.id));
      const seen = (
        await http()
          .get(`/api/v1/me/bookings/${short.booking.id}`)
          .set('Authorization', passenger.auth)
          .expect(200)
      ).body as Booking;
      expect(seen.payment).toMatchObject({ id: short.payment.id, status: 'refunded' });
      // A refunded payment is not confirmed by money reported again.
      await http()
        .post(`/api/v1/me/payments/${short.payment.id}/simulate`)
        .set('Authorization', passenger.auth)
        .send({})
        .expect(200);
      expect(
        (
          (
            await http()
              .get(`/api/v1/me/bookings/${short.booking.id}`)
              .set('Authorization', passenger.auth)
              .expect(200)
          ).body as Booking
        ).payment,
      ).toMatchObject({ status: 'refunded' });
      // Nothing was earned for the unpaid booking.
      expect((await settlement()).balances[0]).toMatchObject({ gross: '75.00' });
    },
  );
});
