import { randomInt, randomUUID } from 'node:crypto';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import {
  presetLayout,
  type AuthResponse,
  type Booking,
  type ExchangeRate,
  type OrganizationMembershipSummary,
  type OtpChallengeResponse,
  type Payment,
  type PaymentOption,
  type Route,
  type SeatLayout,
  type Stop,
  type TicketValidation,
  type TripManifest,
  type TripSummary,
} from '@vtp/shared-types';
import { eq, sql } from 'drizzle-orm';
import request from 'supertest';
import { DatabaseService } from '../src/database/database.service.js';
import { bookings } from '../src/modules/bookings/bookings.schema.js';
import { payments } from '../src/modules/payments/payments.schema.js';
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

describe.runIf(expectDatabase)('Payments and tickets (e2e)', () => {
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

  const signIn = async (email = `pay-e2e-${randomUUID()}@example.com`) => {
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
    'converts fares with operator rates, confirms paid bookings, refunds late money and boards tickets',
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
      const options = (auth: string, bookingId: string) =>
        http().get(`/api/v1/me/bookings/${bookingId}/payment-options`).set('Authorization', auth);
      const pay = (auth: string, bookingId: string, method: string) =>
        http()
          .post(`/api/v1/me/bookings/${bookingId}/payments`)
          .set('Authorization', auth)
          .send({ method });
      const simulate = (auth: string, paymentId: string, body: object = {}) =>
        http()
          .post(`/api/v1/me/payments/${paymentId}/simulate`)
          .set('Authorization', auth)
          .send(body);
      const paymentStatus = async (id: string) =>
        (await db.select().from(payments).where(eq(payments.id, id)))[0]!.status;

      // --- Without rates, only USDT (1:1 with the dollar) can pay a dollar fare.
      const ana = await signIn();
      const held = await book(ana.auth, ['1', '2']);
      expect(held.payment).toBeNull();
      expect(held.passengers.every((p) => p.ticket === null)).toBe(true);
      expect((await options(ana.auth, held.id).expect(200)).body).toEqual([
        { method: 'usdt', amount: '40.00', currency: 'USDT', rate: null },
      ]);

      // --- The operator sets its rates.
      const rates = `${org}/exchange-rates`;
      await http()
        .put(rates)
        .set('Authorization', owner.auth)
        .send({
          rates: [
            { currency: 'VES', unitsPerUsd: '36.5' },
            { currency: 'VES', unitsPerUsd: '37' },
          ],
        })
        .expect(400);
      await http()
        .put(rates)
        .set('Authorization', owner.auth)
        .send({ rates: [{ currency: 'VES', unitsPerUsd: '0' }] })
        .expect(400);
      await http().put(rates).set('Authorization', ana.auth).send({ rates: [] }).expect(404);
      const saved = (
        await http()
          .put(rates)
          .set('Authorization', owner.auth)
          .send({
            rates: [
              { currency: 'VES', unitsPerUsd: '36.5' },
              { currency: 'BRL', unitsPerUsd: '5.4321' },
            ],
          })
          .expect(200)
      ).body as ExchangeRate[];
      expect(saved.map((r) => [r.currency, r.unitsPerUsd])).toEqual([
        ['VES', '36.5000'],
        ['BRL', '5.4321'],
      ]);
      expect((await options(ana.auth, held.id).expect(200)).body as PaymentOption[]).toEqual([
        { method: 'pago_movil', amount: '1460.00', currency: 'VES', rate: '36.500000' },
        { method: 'bank_transfer', amount: '1460.00', currency: 'VES', rate: '36.500000' },
        { method: 'pix', amount: '217.28', currency: 'BRL', rate: '5.432100' },
        { method: 'usdt', amount: '40.00', currency: 'USDT', rate: null },
      ]);

      // --- Paying: one pending payment at a time; switching method voids the previous one.
      const luis = await signIn();
      await options(luis.auth, held.id).expect(404);
      await pay(luis.auth, held.id, 'pix').expect(404);
      await pay(ana.auth, held.id, 'cash').expect(400);
      const pix = (await pay(ana.auth, held.id, 'pix').expect(201)).body as Payment;
      expect(pix).toMatchObject({
        method: 'pix',
        status: 'pending',
        amount: '217.28',
        currency: 'BRL',
        simulated: true,
        expiresAt: held.expiresAt,
      });
      expect(pix.reference).toMatch(new RegExp(`^${held.code}-[A-Z2-9]{2}$`));
      expect(pix.instructions).toContainEqual({
        label: 'Concepto o referencia',
        value: pix.reference,
      });
      const movil = (await pay(ana.auth, held.id, 'pago_movil').expect(201)).body as Payment;
      expect(await paymentStatus(pix.id)).toBe('cancelled');
      const withPayment = (
        await http()
          .get(`/api/v1/me/bookings/${held.id}`)
          .set('Authorization', ana.auth)
          .expect(200)
      ).body as Booking;
      expect(withPayment.payment).toMatchObject({ id: movil.id, status: 'pending' });

      // Money for a voided payment, or too little money, is refunded; the booking stays held.
      expect(((await simulate(ana.auth, pix.id).expect(200)).body as Booking).status).toBe('held');
      expect(await paymentStatus(pix.id)).toBe('refund_due');
      await simulate(luis.auth, movil.id).expect(404);
      const short = (await simulate(ana.auth, movil.id, { amount: '1000.00' }).expect(200))
        .body as Booking;
      expect(short).toMatchObject({
        status: 'held',
        payment: { id: movil.id, status: 'refund_due' },
      });

      // --- The exact amount confirms the booking and issues one ticket per seat.
      const retry = (await pay(ana.auth, held.id, 'pago_movil').expect(201)).body as Payment;
      const paid = (await simulate(ana.auth, retry.id).expect(200)).body as Booking;
      expect(paid).toMatchObject({
        status: 'confirmed',
        expiresAt: null,
        payment: { id: retry.id, status: 'confirmed', expiresAt: null },
      });
      expect(paid.payment!.confirmedAt).not.toBeNull();
      expect(paid.passengers.map((p) => p.ticket?.qr)).toEqual([
        expect.stringMatching(/^VTP1\.[0-9a-f-]{36}$/),
        expect.stringMatching(/^VTP1\.[0-9a-f-]{36}$/),
      ]);
      // Idempotent: a repeated notification changes nothing.
      expect(((await simulate(ana.auth, retry.id).expect(200)).body as Booking).status).toBe(
        'confirmed',
      );
      await options(ana.auth, held.id).expect(409);
      await pay(ana.auth, held.id, 'usdt').expect(409);
      await http()
        .post(`/api/v1/me/bookings/${held.id}/cancel`)
        .set('Authorization', ana.auth)
        .expect(409);

      // --- Money that arrives just after the hold ran out still confirms if the seats are free.
      const late = await book(luis.auth, ['3']);
      const latePayment = (await pay(luis.auth, late.id, 'usdt').expect(201)).body as Payment;
      expect(latePayment).toMatchObject({ amount: '20.00', currency: 'USDT', rate: null });
      await db
        .update(bookings)
        .set({ expiresAt: sql`now() - interval '1 minute'` })
        .where(eq(bookings.id, late.id));
      expect(((await simulate(luis.auth, latePayment.id).expect(200)).body as Booking).status).toBe(
        'confirmed',
      );

      // Once the hold is released, its payment is no longer offered and late money is refunded.
      const maria = await signIn();
      const lost = await book(maria.auth, ['4']);
      const lostPayment = (await pay(maria.auth, lost.id, 'pix').expect(201)).body as Payment;
      await db
        .update(bookings)
        .set({ expiresAt: sql`now() - interval '1 minute'` })
        .where(eq(bookings.id, lost.id));
      const pedro = await signIn();
      await book(pedro.auth, ['4']);
      const released = (
        await http()
          .get(`/api/v1/me/bookings/${lost.id}`)
          .set('Authorization', maria.auth)
          .expect(200)
      ).body as Booking;
      expect(released).toMatchObject({ status: 'expired', payment: null });
      const refunded = (await simulate(maria.auth, lostPayment.id).expect(200)).body as Booking;
      expect(refunded).toMatchObject({
        status: 'expired',
        payment: { id: lostPayment.id, status: 'refund_due' },
      });
      expect(refunded.passengers[0]!.ticket).toBeNull();

      // A cancelled booking's pending payment is voided the next time payments are used.
      const dropped = await book(luis.auth, ['7']);
      const droppedPayment = (await pay(luis.auth, dropped.id, 'usdt').expect(201)).body as Payment;
      await http()
        .post(`/api/v1/me/bookings/${dropped.id}/cancel`)
        .set('Authorization', luis.auth)
        .expect(200);
      expect(await paymentStatus(droppedPayment.id)).toBe('pending');
      await options(luis.auth, (await book(luis.auth, ['8'])).id).expect(200);
      expect(await paymentStatus(droppedPayment.id)).toBe('cancelled');

      // --- Operators: sold seats, then boarding by scanning the tickets.
      const [tripSummary] = (
        await http()
          .get(`${org}/trips`)
          .query({ date })
          .set('Authorization', owner.auth)
          .expect(200)
      ).body as TripSummary[];
      expect(tripSummary).toMatchObject({ soldSeats: 3, heldSeats: 2 });

      const validate = (qr: string, auth = owner.auth) =>
        http().post(`${org}/tickets/validate`).set('Authorization', auth).send({ qr });
      const qr = paid.passengers[0]!.ticket!.qr;
      await validate(qr, ana.auth).expect(404);
      await validate('VTP1.not-a-ticket').expect(404);
      await validate(`VTP1.${randomUUID()}`).expect(404);
      await http()
        .post(`${org}/tickets/validate`)
        .set('Authorization', owner.auth)
        .send({ bookingCode: 'nope' })
        .expect(400);
      // Two days before departure the ticket is not accepted yet, and nothing is marked.
      const early = (await validate(qr).expect(200)).body as TicketValidation;
      expect(early).toMatchObject({ result: 'other_departure', boardedAt: null, seatNumber: '1' });
      // A held seat has no valid ticket; typed by hand with its booking code and seat.
      const pedroHeld = (
        await http().get('/api/v1/me/bookings').set('Authorization', pedro.auth).expect(200)
      ).body as Booking[];
      expect(pedroHeld[0]!.passengers[0]!.ticket).toBeNull();
      const typed = (bookingCode: string, seatNumber: string) =>
        http()
          .post(`${org}/tickets/validate`)
          .set('Authorization', owner.auth)
          .send({ bookingCode, seatNumber });
      expect(
        ((await typed(pedroHeld[0]!.code, '4').expect(200)).body as TicketValidation).result,
      ).toBe('not_paid');
      await typed(pedroHeld[0]!.code, '5').expect(404);

      await db
        .update(bookings)
        .set({ departsAt: sql`now() + interval '30 minutes'` })
        .where(eq(bookings.id, held.id));
      const boarded = (await validate(qr).expect(200)).body as TicketValidation;
      expect(boarded).toMatchObject({
        result: 'boarded',
        bookingCode: held.code,
        bookingStatus: 'confirmed',
        seatNumber: '1',
        passengerName: `Ana Viajera ${run}`,
        route: { id: route.id },
        serviceDate: date,
        from: expect.objectContaining({ id: caracas.id }),
      });
      const again = (await validate(qr).expect(200)).body as TicketValidation;
      expect(again).toMatchObject({ result: 'already_boarded', boardedAt: boarded.boardedAt });
      // The second seat, typed by hand without the VTP- prefix and in lower case.
      const bySeat = (await typed(held.code.slice(4).toLowerCase(), '2').expect(200))
        .body as TicketValidation;
      expect(bySeat).toMatchObject({ result: 'boarded', seatNumber: '2' });

      const manifest = (
        await http()
          .get(`${org}/trips/${tripSummary!.id}/manifest`)
          .set('Authorization', owner.auth)
          .expect(200)
      ).body as TripManifest;
      expect(manifest.passengers.map((p) => [p.seatNumber, p.boardedAt !== null])).toEqual([
        ['1', true],
        ['2', true],
        ['3', false],
        ['4', false],
        ['8', false],
      ]);
      const ticketsAfter = (
        await http()
          .get(`/api/v1/me/bookings/${held.id}`)
          .set('Authorization', ana.auth)
          .expect(200)
      ).body as Booking;
      expect(ticketsAfter.passengers[0]!.ticket!.boardedAt).toBe(boarded.boardedAt);
    },
  );
});
