import { randomInt, randomUUID } from 'node:crypto';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import {
  presetLayout,
  type AuthResponse,
  type Booking,
  type OrganizationMembershipSummary,
  type OtpChallengeResponse,
  type Payment,
  type PaymentAccount,
  type PaymentOption,
  type PaymentReview,
  type Route,
  type SeatLayout,
  type Stop,
} from '@vtp/shared-types';
import { and, eq } from 'drizzle-orm';
import request from 'supertest';
import { DatabaseService } from '../src/database/database.service.js';
import { bookings } from '../src/modules/bookings/bookings.schema.js';
import { users } from '../src/modules/identity/identity.schema.js';
import type { OtpMessage, OtpSender } from '../src/modules/identity/otp/otp-sender.js';
import { addDays, todayInVenezuela } from '../src/modules/network/departures.js';
import { notifications } from '../src/modules/notifications/notifications.schema.js';
import { NotificationsService } from '../src/modules/notifications/notifications.service.js';
import { settlementEntries } from '../src/modules/settlements/settlements.schema.js';

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

describe.runIf(expectDatabase)('Manual payments (e2e)', () => {
  let app: NestExpressApplication;
  const otp = new CapturingOtpSender();
  const http = () => request(app.getHttpServer());
  const run = randomUUID().slice(0, 8);
  const previousProvider = process.env.PAYMENT_PROVIDER;

  beforeAll(async () => {
    process.env.AUTH_RATE_LIMIT_MAX = '1000';
    process.env.RATE_LIMIT_MAX = '10000';
    process.env.OTP_RESEND_SECONDS = '0';
    process.env.OTP_MAX_PER_HOUR = '100';
    process.env.PAYMENT_PROVIDER = 'manual';
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
    if (previousProvider === undefined) delete process.env.PAYMENT_PROVIDER;
    else process.env.PAYMENT_PROVIDER = previousProvider;
  });

  const signIn = async (email = `manual-pay-${randomUUID()}@example.com`) => {
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
    'shows the platform accounts, holds the seats while staff verify, and confirms or rejects',
    { timeout: 30_000 },
    async () => {
      // --- Setup: an approved bus company with a published route priced in dollars.
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
      const [caracas, maracaibo] = [await stop('Caracas'), await stop('Maracaibo')];
      const owner = await signIn();
      const { organization } = (
        await http()
          .post('/api/v1/organizations')
          .set('Authorization', owner.auth)
          .send({
            type: 'bus_company',
            legalName: `Pagos ${run}`,
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
      const book = async (auth: string, seats: string[]) =>
        (
          await http()
            .post('/api/v1/bookings')
            .set('Authorization', auth)
            .send({
              scheduleId,
              serviceDate: date,
              fromStopId: caracas.id,
              toStopId: maracaibo.id,
              passengers: seats.map((seat) => passenger(seat)),
            })
            .expect(201)
        ).body as Booking;
      const admin = await signIn();
      await db.update(users).set({ platformRole: 'admin' }).where(eq(users.id, admin.user.id));
      const asAdmin = (req: request.Test) => req.set('Authorization', admin.auth);
      const options = (auth: string, bookingId: string) =>
        http().get(`/api/v1/me/bookings/${bookingId}/payment-options`).set('Authorization', auth);
      const pay = (auth: string, bookingId: string, method: string) =>
        http()
          .post(`/api/v1/me/bookings/${bookingId}/payments`)
          .set('Authorization', auth)
          .send({ method });
      const report = (auth: string, paymentId: string, operationNumber = '004512873301') =>
        http()
          .post(`/api/v1/me/payments/${paymentId}/report`)
          .set('Authorization', auth)
          .send({ operationNumber });
      const queue = async () =>
        (await asAdmin(http().get('/api/v1/admin/payments/review')).expect(200))
          .body as PaymentReview[];

      // --- Accounts: only admins edit them; each method needs all its fields.
      await asAdmin(http().delete('/api/v1/admin/payment-accounts/pix'));
      await asAdmin(http().delete('/api/v1/admin/payment-accounts/bank_transfer'));
      await http()
        .put('/api/v1/admin/payment-accounts/usdt')
        .set('Authorization', owner.auth)
        .send({ fields: { network: 'TRON', address: 'T123' }, active: true })
        .expect(403);
      await asAdmin(http().put('/api/v1/admin/payment-accounts/pago_movil'))
        .send({ fields: { bank: '0102 – Banco de Venezuela' }, active: true })
        .expect(400);
      const account = (
        await asAdmin(http().put('/api/v1/admin/payment-accounts/pago_movil'))
          .send({
            fields: {
              bank: ' 0102 – Banco de Venezuela ',
              phone: '0414-1234567',
              document: 'J-12345678-9',
            },
            active: true,
          })
          .expect(200)
      ).body as PaymentAccount;
      expect(account.fields.bank).toBe('0102 – Banco de Venezuela');
      await asAdmin(http().put('/api/v1/admin/payment-accounts/usdt'))
        .send({ fields: { network: 'TRON (TRC-20)', address: 'TXYZ123' }, active: false })
        .expect(200);
      expect(
        (
          (await asAdmin(http().get('/api/v1/admin/payment-accounts')).expect(200))
            .body as PaymentAccount[]
        ).map((a) => [a.method, a.active]),
      ).toEqual([
        ['pago_movil', true],
        ['usdt', false],
      ]);

      await http()
        .put(`${org}/exchange-rates`)
        .set('Authorization', owner.auth)
        .send({ rates: [{ currency: 'VES', unitsPerUsd: '36.5' }] })
        .expect(200);

      // --- Only active accounts are offered; the instructions are the account and the concept.
      const ana = await signIn();
      const held = await book(ana.auth, ['1']);
      expect(
        ((await options(ana.auth, held.id).expect(200)).body as PaymentOption[]).map(
          (o) => o.method,
        ),
      ).toEqual(['pago_movil']);
      await pay(ana.auth, held.id, 'usdt').expect(409);
      const first = (await pay(ana.auth, held.id, 'pago_movil').expect(201)).body as Payment;
      expect(first).toMatchObject({
        manual: true,
        simulated: false,
        amount: '730.00',
        currency: 'VES',
      });
      expect(first.instructions).toEqual([
        { label: 'Banco', value: '0102 – Banco de Venezuela' },
        { label: 'Teléfono', value: '0414-1234567' },
        { label: 'RIF o cédula', value: 'J-12345678-9' },
        { label: 'Concepto o referencia', value: first.reference },
      ]);
      await http()
        .post(`/api/v1/me/payments/${first.id}/simulate`)
        .set('Authorization', ana.auth)
        .send({})
        .expect(404);

      // --- "I paid": the seats stay held for the review; no other payment starts meanwhile.
      const stranger = await signIn();
      await report(stranger.auth, first.id).expect(404);
      const reported = (await report(ana.auth, first.id).expect(200)).body as Booking;
      expect(reported.status).toBe('held');
      expect(reported.payment).toMatchObject({
        status: 'reported',
        payerReference: '004512873301',
      });
      expect(Date.parse(reported.expiresAt!) - Date.now()).toBeGreaterThan(5 * 3_600_000);
      await report(ana.auth, first.id).expect(409);
      await pay(ana.auth, held.id, 'pago_movil').expect(409);

      // --- Staff do not find it: Ana is told why and can pay again.
      const waiting = await queue();
      const item = waiting.find((r) => r.payment.id === first.id)!;
      expect(item).toMatchObject({
        booking: { code: held.code, status: 'held' },
        operator: { id: organization.id },
        payer: { email: ana.email },
      });
      await http()
        .post(`/api/v1/admin/payments/${first.id}/reject`)
        .set('Authorization', owner.auth)
        .send({ reason: 'No llegó.' })
        .expect(403);
      const rejected = (
        await asAdmin(http().post(`/api/v1/admin/payments/${first.id}/reject`))
          .send({ reason: 'No llegó ningún pago con esa referencia.' })
          .expect(200)
      ).body as Payment;
      expect(rejected).toMatchObject({
        status: 'rejected',
        rejectionReason: 'No llegó ningún pago con esa referencia.',
      });
      await asAdmin(http().post(`/api/v1/admin/payments/${first.id}/confirm`))
        .send({})
        .expect(409);
      const afterReject = (
        await http()
          .get(`/api/v1/me/bookings/${held.id}`)
          .set('Authorization', ana.auth)
          .expect(200)
      ).body as Booking;
      expect(afterReject.payment).toMatchObject({ status: 'rejected' });
      expect(Date.parse(afterReject.expiresAt!) - Date.now()).toBeLessThan(16 * 60_000);
      await app.get(NotificationsService).settled();
      expect(
        await db
          .select({ kind: notifications.kind })
          .from(notifications)
          .where(and(eq(notifications.userId, ana.user.id), eq(notifications.reference, held.id))),
      ).toEqual([{ kind: 'payment_rejected' }]);

      // --- Second try: found, the booking is confirmed and the operator earns it.
      const second = (await pay(ana.auth, held.id, 'pago_movil').expect(201)).body as Payment;
      await report(ana.auth, second.id, '009988776655').expect(200);
      const confirmed = (
        await asAdmin(http().post(`/api/v1/admin/payments/${second.id}/confirm`))
          .send({})
          .expect(200)
      ).body as Payment;
      expect(confirmed.status).toBe('confirmed');
      const paid = (
        await http()
          .get(`/api/v1/me/bookings/${held.id}`)
          .set('Authorization', ana.auth)
          .expect(200)
      ).body as Booking;
      expect(paid.status).toBe('confirmed');
      expect(paid.passengers[0]!.ticket).not.toBeNull();
      expect(
        await db.select().from(settlementEntries).where(eq(settlementEntries.bookingId, held.id)),
      ).toHaveLength(1);
      expect((await queue()).some((r) => r.payment.id === second.id)).toBe(false);

      // --- Short money goes to refunds instead of confirming.
      const luis = await signIn();
      const short = await book(luis.auth, ['2']);
      const shortPayment = (await pay(luis.auth, short.id, 'pago_movil').expect(201))
        .body as Payment;
      await report(luis.auth, shortPayment.id).expect(200);
      expect(
        (
          (
            await asAdmin(http().post(`/api/v1/admin/payments/${shortPayment.id}/confirm`))
              .send({ receivedAmount: '700' })
              .expect(200)
          ).body as Payment
        ).status,
      ).toBe('refund_due');
      const [shortBooking] = await db.select().from(bookings).where(eq(bookings.id, short.id));
      expect(shortBooking!.status).toBe('held');

      // --- An inactive account stops the method; no account at all: nothing to offer.
      await asAdmin(http().put('/api/v1/admin/payment-accounts/pago_movil'))
        .send({ fields: account.fields, active: false })
        .expect(200);
      expect((await options(luis.auth, short.id).expect(200)).body).toEqual([]);
      await asAdmin(http().put('/api/v1/admin/payment-accounts/pago_movil'))
        .send({ fields: account.fields, active: true })
        .expect(200);
    },
  );
});
