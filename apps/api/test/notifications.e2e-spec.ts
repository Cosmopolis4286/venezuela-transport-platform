import { randomInt, randomUUID } from 'node:crypto';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import {
  todayInVenezuela,
  type AuthResponse,
  type Booking,
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
import { notifications, pushDevices } from '../src/modules/notifications/notifications.schema.js';
import { NotificationsService } from '../src/modules/notifications/notifications.service.js';
import { TripRemindersService } from '../src/modules/notifications/trip-reminders.service.js';
import type { OtpMessage, OtpSender } from '../src/modules/identity/otp/otp-sender.js';
import { addDays } from '../src/modules/network/departures.js';

const expectDatabase = process.env.E2E_EXPECT_DATABASE === 'true';

class CapturingPushSender {
  readonly enabled = true;
  readonly sent: { to: string; title: string; body: string; data?: Record<string, string> }[] = [];
  /** Tokens the fake push service reports as uninstalled. */
  readonly gone = new Set<string>();
  async send(messages: CapturingPushSender['sent']) {
    this.sent.push(...messages);
    return { invalidTokens: messages.map((m) => m.to).filter((t) => this.gone.has(t)) };
  }
}

class CapturingMailer {
  readonly enabled = true;
  readonly sent: { to: string; subject: string; text: string }[] = [];
  async send(message: CapturingMailer['sent'][number]) {
    this.sent.push(message);
  }
}

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

describe.runIf(expectDatabase)('Notifications (e2e)', () => {
  let app: NestExpressApplication;
  const otp = new CapturingOtpSender();
  const push = new CapturingPushSender();
  const mail = new CapturingMailer();
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
    const { PUSH_SENDER } = await import('../src/modules/notifications/push-sender.js');
    const { MAILER } = await import('../src/mail/mailer.js');
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(OTP_SENDER)
      .useValue(otp)
      .overrideProvider(PUSH_SENDER)
      .useValue(push)
      .overrideProvider(MAILER)
      .useValue(mail)
      .compile();
    app = moduleRef.createNestApplication<NestExpressApplication>();
    configureApp(app);
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  const signIn = async (email = `notify-e2e-${randomUUID()}@example.com`) => {
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
    'registers devices and notifies payments, reminders, cancellations and refunds by push and e-mail',
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
            legalName: `Avisos ${run}`,
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
      const notifier = app.get(NotificationsService);
      const reminders = app.get(TripRemindersService);
      const devices = (auth: string) =>
        http().post('/api/v1/me/push-devices').set('Authorization', auth);
      const token = (name: string) => `ExponentPushToken[${name}${run}]`;
      const pushesTo = (t: string) => push.sent.filter((m) => m.to === t);
      const logged = async (userId: string) =>
        (
          await db
            .select()
            .from(notifications)
            .where(eq(notifications.userId, userId))
            .orderBy(notifications.createdAt)
        ).map((n) => `${n.kind}:${n.channel}:${n.status}`);

      // --- Devices: validated, and a token moves to whoever signs in on that phone.
      await devices(passenger.auth)
        .send({ token: 'not-a-token', app: 'passenger', platform: 'android', locale: 'en' })
        .expect(400);
      await devices(passenger.auth)
        .send({ token: token('phone'), app: 'passenger', platform: 'web', locale: 'xx' })
        .expect(400);
      const borrower = await signIn();
      await devices(borrower.auth)
        .send({ token: token('phone'), app: 'passenger', platform: 'android', locale: 'es' })
        .expect(204);
      await devices(passenger.auth)
        .send({ token: token('phone'), app: 'passenger', platform: 'android', locale: 'en' })
        .expect(204);
      await devices(passenger.auth)
        .send({ token: token('old'), app: 'passenger', platform: 'ios', locale: 'en' })
        .expect(204);
      push.gone.add(token('old'));

      // --- Payment confirmed: push in the device's language and an e-mail in the same language.
      const paid = await book(['1']);
      const payment = (
        await http()
          .post(`/api/v1/me/bookings/${paid.id}/payments`)
          .set('Authorization', passenger.auth)
          .send({ method: 'usdt' })
          .expect(201)
      ).body as Payment;
      await http()
        .post(`/api/v1/me/payments/${payment.id}/simulate`)
        .set('Authorization', passenger.auth)
        .send({})
        .expect(200);
      await notifier.settled();
      expect(pushesTo(token('phone'))).toEqual([
        {
          to: token('phone'),
          title: 'Payment confirmed',
          body: expect.stringContaining(paid.code),
          data: { bookingId: paid.id },
        },
      ]);
      expect(mail.sent.filter((m) => m.to === passenger.email)).toEqual([
        {
          to: passenger.email,
          subject: 'Payment confirmed',
          text: expect.stringContaining('This is an automatic message.'),
        },
      ]);
      // The uninstalled app's token was dropped; the borrower got nothing.
      expect(
        (
          await db
            .select()
            .from(pushDevices)
            .where(eq(pushDevices.token, token('old')))
        ).length,
      ).toBe(0);
      expect(await logged(borrower.user.id)).toEqual([]);

      // --- Trip reminder: once, a few hours before boarding.
      await db
        .update(bookings)
        .set({ departsAt: sql`now() + interval '2 hours'` })
        .where(eq(bookings.id, paid.id));
      expect(await reminders.sweep()).toBeGreaterThanOrEqual(1);
      expect(await reminders.sweep()).toBe(0);
      await notifier.settled();
      expect(pushesTo(token('phone')).map((m) => m.title)).toEqual([
        'Payment confirmed',
        'Your trip is today',
      ]);

      // --- Cancelling a paid trip, then the refund: push and e-mail for both.
      const later = await book(['2']);
      const laterPayment = (
        await http()
          .post(`/api/v1/me/bookings/${later.id}/payments`)
          .set('Authorization', passenger.auth)
          .send({ method: 'usdt' })
          .expect(201)
      ).body as Payment;
      await http()
        .post(`/api/v1/me/payments/${laterPayment.id}/simulate`)
        .set('Authorization', passenger.auth)
        .send({})
        .expect(200);
      await http()
        .post(`/api/v1/me/bookings/${later.id}/cancel`)
        .set('Authorization', passenger.auth)
        .expect(200);
      await http()
        .post(`/api/v1/admin/refunds/${laterPayment.id}`)
        .set('Authorization', admin.auth)
        .send({ reference: 'TRX-777' })
        .expect(204);
      await notifier.settled();
      const titles = pushesTo(token('phone')).map((m) => m.title);
      expect(titles.slice(-2)).toEqual(['Booking cancelled', 'We refunded your money']);
      expect(pushesTo(token('phone')).at(-1)!.body).toMatch(/25\.00 USDT.*TRX-777/);
      expect(await logged(passenger.user.id)).toEqual([
        'payment_confirmed:push:sent',
        'payment_confirmed:email:sent',
        'trip_reminder:push:sent',
        'payment_confirmed:push:sent',
        'payment_confirmed:email:sent',
        'booking_cancelled:push:sent',
        'booking_cancelled:email:sent',
        'refund_sent:push:sent',
        'refund_sent:email:sent',
      ]);

      // --- Signing out removes the device; nothing else reaches it.
      await http()
        .delete('/api/v1/me/push-devices')
        .set('Authorization', passenger.auth)
        .send({ token: token('phone') })
        .expect(204);
      expect(
        (
          await db
            .select()
            .from(pushDevices)
            .where(eq(pushDevices.token, token('phone')))
        ).length,
      ).toBe(0);
    },
  );
});
