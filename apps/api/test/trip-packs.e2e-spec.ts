import { randomInt, randomUUID } from 'node:crypto';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import type {
  AuthResponse,
  Booking,
  CancellationQuote,
  PlatformMetrics,
  SalesReport,
  Route,
  TripAvailability,
  OtpChallengeResponse,
  Payment,
  PaymentOption,
  RefundDuePayment,
  ServiceArea,
  Stop,
  TripPack,
  TripPackProduct,
} from '@vtp/shared-types';
import { eq, sql } from 'drizzle-orm';
import request from 'supertest';
import { DatabaseService } from '../src/database/database.service.js';
import { users } from '../src/modules/identity/identity.schema.js';
import type { OtpMessage, OtpSender } from '../src/modules/identity/otp/otp-sender.js';
import { bookings } from '../src/modules/bookings/bookings.schema.js';
import { addDays, todayInVenezuela } from '../src/modules/network/departures.js';
import { settlementEntries } from '../src/modules/settlements/settlements.schema.js';
import { platformExchangeRates } from '../src/modules/payments/payments.schema.js';
import { tripPacks } from '../src/modules/trip-packs/trip-packs.schema.js';
import { TripRemindersService } from '../src/modules/notifications/trip-reminders.service.js';

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

/** Trip packs the platform sells (ADR-028): catalog, purchase, payment and activation. */
describe.runIf(expectDatabase)('Trip packs (e2e)', () => {
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

  const signIn = async (role?: 'reviewer' | 'admin') => {
    const email = `pack-e2e-${randomUUID()}@example.com`;
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

  it('sells packs of a corridor, activates them when paid and voids unpaid ones', async () => {
    const admin = await signIn('admin');
    const passenger = await signIn();
    const db = app.get(DatabaseService).db;

    const stop = async (name: string) =>
      (
        await http()
          .post('/api/v1/admin/stops')
          .set('Authorization', admin.auth)
          .send({ kind: 'stop', name: `${name} ${run}`, city: `${name} ${run}`, state: 'Bolívar' })
          .expect(201)
      ).body as Stop;
    const sanFelix = await stop('Pack San Félix');
    const puertoOrdaz = await stop('Pack Puerto Ordaz');
    const elsewhere = await stop('Pack Caracas');
    const area = (
      await http()
        .post('/api/v1/admin/service-areas')
        .set('Authorization', admin.auth)
        .send({ name: `Paquetes ${run}`, stopIds: [sanFelix.id, puertoOrdaz.id], active: true })
        .expect(201)
    ).body as ServiceArea;

    // --- Catalog: platform admins only, both stops in the corridor.
    const productsUrl = '/api/v1/admin/trip-pack-products';
    const body = {
      serviceAreaId: area.id,
      stopIds: [sanFelix.id, puertoOrdaz.id],
      mode: 'bus',
      trips: 10,
      price: '15',
      currency: 'USD',
    };
    await http().post(productsUrl).set('Authorization', passenger.auth).send(body).expect(403);
    expect(
      reason(
        await http()
          .post(productsUrl)
          .set('Authorization', admin.auth)
          .send({ ...body, stopIds: [sanFelix.id, elsewhere.id] })
          .expect(409),
      ),
    ).toBe('ROUTE_OUTSIDE_SERVICE_AREA');
    await http()
      .post(productsUrl)
      .set('Authorization', admin.auth)
      .send({ ...body, trips: 1 })
      .expect(400);
    const product = (
      await http().post(productsUrl).set('Authorization', admin.auth).send(body).expect(201)
    ).body as TripPackProduct;
    expect(product).toMatchObject({
      price: '15.00',
      unitPrice: '1.50',
      validityDays: 60,
      active: true,
      serviceArea: { id: area.id },
    });
    const onSale = (
      await http().get('/api/v1/trip-pack-products').query({ serviceAreaId: area.id }).expect(200)
    ).body as TripPackProduct[];
    expect(onSale.map((p) => p.id)).toEqual([product.id]);

    // --- Buying: the pack waits for its payment.
    const buy = () =>
      http()
        .post('/api/v1/me/trip-packs')
        .set('Authorization', passenger.auth)
        .send({ productId: product.id });
    const pack = (await buy().expect(201)).body as TripPack;
    expect(pack).toMatchObject({
      status: 'pending_payment',
      trips: 10,
      remaining: 10,
      price: '15.00',
      currency: 'USD',
      expiresAt: null,
      payment: null,
    });
    expect(pack.code).toMatch(/^PAQ-[A-Z2-9]{6}$/);
    expect(pack.paymentDueAt).not.toBeNull();

    // --- Paying: the platform's own exchange rates convert the price.
    const optionsUrl = `/api/v1/me/trip-packs/${pack.id}/payment-options`;
    const options = async () =>
      (await http().get(optionsUrl).set('Authorization', passenger.auth).expect(200))
        .body as PaymentOption[];
    await http()
      .put('/api/v1/admin/exchange-rates')
      .set('Authorization', admin.auth)
      .send({ rates: [{ currency: 'VES', unitsPerUsd: '40' }] })
      .expect(200);
    expect(await options()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ method: 'usdt', amount: '15.00', currency: 'USDT' }),
        expect.objectContaining({ method: 'pago_movil', amount: '600.00', currency: 'VES' }),
      ]),
    );
    // A rate older than a day is not used: no payment in bolívares until it is saved again.
    const rates = app.get(DatabaseService).db;
    await rates
      .update(platformExchangeRates)
      .set({ updatedAt: new Date(Date.now() - 25 * 3600_000) })
      .where(eq(platformExchangeRates.currency, 'VES'));
    expect((await options()).map((o) => o.method)).not.toContain('pago_movil');
    await rates
      .update(platformExchangeRates)
      .set({ updatedAt: new Date() })
      .where(eq(platformExchangeRates.currency, 'VES'));
    expect((await options()).map((o) => o.method)).toContain('pago_movil');
    const payment = (
      await http()
        .post(`/api/v1/me/trip-packs/${pack.id}/payments`)
        .set('Authorization', passenger.auth)
        .send({ method: 'usdt' })
        .expect(201)
    ).body as Payment;
    expect(payment).toMatchObject({ tripPackId: pack.id, bookingId: null, status: 'pending' });
    expect(payment.reference.startsWith(pack.code)).toBe(true);
    const paid = (
      await http()
        .post(`/api/v1/me/payments/${payment.id}/simulate`)
        .set('Authorization', passenger.auth)
        .send({})
        .expect(200)
    ).body as TripPack;
    expect(paid).toMatchObject({
      id: pack.id,
      status: 'active',
      paymentDueAt: null,
      payment: expect.objectContaining({ status: 'confirmed' }),
    });
    const days = (Date.parse(paid.expiresAt!) - Date.parse(paid.activatedAt!)) / 86_400_000;
    expect(Math.round(days)).toBe(60);
    // Three days before it expires, with trips left, the passenger is reminded once.
    const reminders = app.get(TripRemindersService);
    expect(await reminders.sweepPacks()).toBeGreaterThanOrEqual(0);
    await db
      .update(tripPacks)
      .set({ expiresAt: sql`now() + interval '2 days'` })
      .where(eq(tripPacks.id, pack.id));
    await reminders.sweepPacks();
    const [reminded] = await db.select().from(tripPacks).where(eq(tripPacks.id, pack.id));
    expect(reminded?.expiryNoticeSentAt).not.toBeNull();
    const again = reminded!.expiryNoticeSentAt!.getTime();
    await reminders.sweepPacks();
    const [still] = await db.select().from(tripPacks).where(eq(tripPacks.id, pack.id));
    expect(still?.expiryNoticeSentAt?.getTime()).toBe(again);
    await db
      .update(tripPacks)
      .set({ expiresAt: paid.expiresAt ? new Date(paid.expiresAt) : null })
      .where(eq(tripPacks.id, pack.id));
    // Paying again or asking for options of an active pack is refused.
    expect(
      reason(await http().get(optionsUrl).set('Authorization', passenger.auth).expect(409)),
    ).toBe('TRIP_PACK_NOT_AWAITING_PAYMENT');

    // --- An unpaid pack is voided after its payment time; money arriving later is refunded.
    const late = (await buy().expect(201)).body as TripPack;
    // At most two packs waiting for payment at a time.
    const second = (await buy().expect(201)).body as TripPack;
    expect(reason(await buy().expect(409))).toBe('TRIP_PACK_UNPAID_LIMIT');
    await db
      .update(tripPacks)
      .set({ paymentDueAt: sql`now() - interval '1 minute'` })
      .where(eq(tripPacks.id, second.id));
    const latePayment = (
      await http()
        .post(`/api/v1/me/trip-packs/${late.id}/payments`)
        .set('Authorization', passenger.auth)
        .send({ method: 'usdt' })
        .expect(201)
    ).body as Payment;
    await db
      .update(tripPacks)
      .set({ paymentDueAt: sql`now() - interval '1 minute'` })
      .where(eq(tripPacks.id, late.id));
    const mine = (
      await http().get('/api/v1/me/trip-packs').set('Authorization', passenger.auth).expect(200)
    ).body as TripPack[];
    expect(mine.find((p) => p.id === late.id)?.status).toBe('cancelled');
    expect(mine.find((p) => p.id === pack.id)?.status).toBe('active');
    const refunded = (
      await http()
        .post(`/api/v1/me/payments/${latePayment.id}/simulate`)
        .set('Authorization', passenger.auth)
        .send({})
        .expect(200)
    ).body as TripPack;
    expect(refunded).toMatchObject({ status: 'cancelled' });
    const refunds = (
      await http().get('/api/v1/admin/refunds').set('Authorization', admin.auth).expect(200)
    ).body as RefundDuePayment[];
    expect(refunds.find((r) => r.paymentId === latePayment.id)).toMatchObject({
      tripPackId: late.id,
      bookingId: null,
      bookingCode: late.code,
      organization: null,
    });

    // --- Inactive products are not sold; bought packs keep working.
    await http()
      .patch(`${productsUrl}/${product.id}`)
      .set('Authorization', admin.auth)
      .send({ active: false })
      .expect(200);
    expect(reason(await buy().expect(409))).toBe('TRIP_PACK_NOT_FOR_SALE');
    await http()
      .get(`/api/v1/me/trip-packs/${pack.id}`)
      .set('Authorization', passenger.auth)
      .expect(200);
  });
  it('pays bookings with a pack, within its limits, and gives trips back in time', async () => {
    const admin = await signIn('admin');
    const owner = await signIn();
    const passenger = await signIn();
    const db = app.get(DatabaseService).db;
    const stop = async (name: string) =>
      (
        await http()
          .post('/api/v1/admin/stops')
          .set('Authorization', admin.auth)
          .send({ kind: 'stop', name: `${name} ${run}`, city: `${name} ${run}`, state: 'Bolívar' })
          .expect(201)
      ).body as Stop;
    const a = await stop('Uso San Félix');
    const b = await stop('Uso Puerto Ordaz');
    const area = (
      await http()
        .post('/api/v1/admin/service-areas')
        .set('Authorization', admin.auth)
        .send({ name: `Uso ${run}`, stopIds: [a.id, b.id], active: true })
        .expect(201)
    ).body as ServiceArea;

    // An approved bus company with a daily suburban route each way.
    const { organization } = (
      await http()
        .post('/api/v1/organizations')
        .set('Authorization', owner.auth)
        .send({
          type: 'bus_company',
          legalName: `Busetas ${run}`,
          rif: `J-${randomInt(10_000_000, 99_999_999)}-${randomInt(0, 9)}`,
        })
        .expect(201)
    ).body as { organization: { id: string } };
    await http()
      .post(`/api/v1/admin/organizations/${organization.id}/review`)
      .set('Authorization', admin.auth)
      .send({ decision: 'approve' })
      .expect(200);
    const tomorrow = addDays(todayInVenezuela(), 1);
    const route = async (from: Stop, to: Stop) => {
      const url = `/api/v1/organizations/${organization.id}/routes`;
      const created = (
        await http()
          .post(url)
          .set('Authorization', owner.auth)
          .send({
            name: `${from.city} – ${to.city}`,
            service: 'suburban',
            serviceAreaId: area.id,
            stops: [
              { stopId: from.id, minutesFromOrigin: 0 },
              { stopId: to.id, minutesFromOrigin: 30 },
            ],
          })
          .expect(201)
      ).body as Route;
      await http()
        .put(`${url}/${created.id}/fares`)
        .set('Authorization', owner.auth)
        .send({
          fares: [{ fromStopId: from.id, toStopId: to.id, amount: '2.00', currency: 'USD' }],
        })
        .expect(200);
      const withSchedule = (
        await http()
          .post(`${url}/${created.id}/schedules`)
          .set('Authorization', owner.auth)
          .send({
            departureTime: '07:00',
            daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
            validFrom: tomorrow,
            serviceClass: 'standard',
            seats: 30,
          })
          .expect(201)
      ).body as Route;
      await http()
        .post(`${url}/${created.id}/status`)
        .set('Authorization', owner.auth)
        .send({ status: 'active' })
        .expect(200);
      return withSchedule.schedules[0]!.id;
    };
    const going = await route(a, b);
    const coming = await route(b, a);

    // A paid pack of the stretch.
    const product = (
      await http()
        .post('/api/v1/admin/trip-pack-products')
        .set('Authorization', admin.auth)
        .send({
          serviceAreaId: area.id,
          stopIds: [a.id, b.id],
          mode: 'bus',
          trips: 10,
          price: '12',
          currency: 'USD',
        })
        .expect(201)
    ).body as TripPackProduct;
    const bought = (
      await http()
        .post('/api/v1/me/trip-packs')
        .set('Authorization', passenger.auth)
        .send({ productId: product.id })
        .expect(201)
    ).body as TripPack;
    const payment = (
      await http()
        .post(`/api/v1/me/trip-packs/${bought.id}/payments`)
        .set('Authorization', passenger.auth)
        .send({ method: 'usdt' })
        .expect(201)
    ).body as Payment;
    await http()
      .post(`/api/v1/me/payments/${payment.id}/simulate`)
      .set('Authorization', passenger.auth)
      .send({})
      .expect(200);
    const remaining = async () =>
      (
        (
          await http()
            .get(`/api/v1/me/trip-packs/${bought.id}`)
            .set('Authorization', passenger.auth)
            .expect(200)
        ).body as TripPack
      ).remaining;

    const book = (scheduleId: string, from: Stop, to: Stop, date: string, seats = ['1']) =>
      http()
        .post('/api/v1/bookings')
        .set('Authorization', passenger.auth)
        .send({
          scheduleId,
          serviceDate: date,
          fromStopId: from.id,
          toStopId: to.id,
          tripPackId: bought.id,
          passengers: seats.map((seatNumber, i) => ({
            seatNumber,
            firstName: 'Luis',
            lastName: `Diario ${run}`,
            documentType: 'V',
            documentNumber: `${20_000_000 + i}`,
          })),
        });

    // The operator must accept packs (a platform admin enables it).
    expect(reason(await book(going, a, b, tomorrow).expect(409))).toBe('TRIP_PACK_NOT_VALID_HERE');
    await http()
      .put(`/api/v1/admin/organizations/${organization.id}/policy`)
      .set('Authorization', admin.auth)
      .send({ commissionRate: null, refundTiers: null, acceptsTripPacks: true })
      .expect(200);
    const availability = (
      await http()
        .get('/api/v1/trips/availability')
        .query({ scheduleId: going, serviceDate: tomorrow, from: a.id, to: b.id })
        .expect(200)
    ).body as TripAvailability;
    expect(availability).toMatchObject({
      acceptsTripPacks: true,
      mode: 'bus',
      service: 'suburban',
      serviceAreaId: area.id,
    });

    // Two seats: confirmed at once, two trips spent, the operator earns its fare.
    const first = (await book(going, a, b, tomorrow, ['1', '2']).expect(201)).body as Booking;
    expect(first).toMatchObject({
      status: 'confirmed',
      payment: null,
      tripPack: { id: bought.id, code: bought.code },
      total: { amount: '4.00', currency: 'USD' },
    });
    expect(first.passengers.every((p) => p.ticket)).toBe(true);
    expect(await remaining()).toBe(8);
    const earned = await db
      .select()
      .from(settlementEntries)
      .where(eq(settlementEntries.bookingId, first.id));
    expect(earned).toEqual([
      expect.objectContaining({ kind: 'booking', gross: '4.00', collectedBy: 'platform' }),
    ]);
    // One booking per departure; the other direction works too.
    expect(reason(await book(going, a, b, tomorrow, ['3']).expect(409))).toBe(
      'TRIP_PACK_ONE_PER_DEPARTURE',
    );
    await book(coming, b, a, tomorrow).expect(201);
    // At most four upcoming bookings per pack.
    await book(going, a, b, addDays(tomorrow, 1)).expect(201);
    const fourth = (await book(going, a, b, addDays(tomorrow, 2)).expect(201)).body as Booking;
    expect(reason(await book(going, a, b, addDays(tomorrow, 3)).expect(409))).toBe(
      'TRIP_PACK_TOO_MANY_BOOKINGS',
    );
    expect(await remaining()).toBe(5);

    // Cancelling 30 minutes or more before boarding gives the trips back and undoes the earning.
    const quote = (booking: Booking) =>
      http()
        .get(`/api/v1/me/bookings/${booking.id}/cancellation`)
        .set('Authorization', passenger.auth)
        .expect(200)
        .then((res) => res.body as CancellationQuote);
    expect((await quote(first)).tripPack).toEqual({ code: bought.code, tripsBack: 2 });
    await http()
      .post(`/api/v1/me/bookings/${first.id}/cancel`)
      .set('Authorization', passenger.auth)
      .expect(200);
    expect(await remaining()).toBe(7);
    const entries = await db
      .select()
      .from(settlementEntries)
      .where(eq(settlementEntries.bookingId, first.id));
    expect(entries.find((e) => e.kind === 'cancellation')).toMatchObject({
      gross: '-4.00',
      earned: `-${entries.find((e) => e.kind === 'booking')!.earned}`,
    });

    // Later than that, the trip is lost and the operator keeps its fare.
    await db
      .update(bookings)
      .set({ departsAt: sql`now() + interval '20 minutes'` })
      .where(eq(bookings.id, fourth.id));
    expect((await quote(fourth)).tripPack).toEqual({ code: bought.code, tripsBack: 0 });
    await http()
      .post(`/api/v1/me/bookings/${fourth.id}/cancel`)
      .set('Authorization', passenger.auth)
      .expect(200);
    expect(await remaining()).toBe(7);

    // Not enough trips left for the seats asked: nothing is spent.
    await db.update(tripPacks).set({ remaining: 1 }).where(eq(tripPacks.id, bought.id));
    expect(reason(await book(going, a, b, addDays(tomorrow, 4), ['1', '2']).expect(409))).toBe(
      'TRIP_PACK_EXHAUSTED',
    );
    expect(await remaining()).toBe(1);
    // The last trip empties the pack.
    await book(going, a, b, addDays(tomorrow, 4)).expect(201);
    expect(
      (
        (
          await http()
            .get(`/api/v1/me/trip-packs/${bought.id}`)
            .set('Authorization', passenger.auth)
            .expect(200)
        ).body as TripPack
      ).status,
    ).toBe('exhausted');

    // --- Reports: the operator sees the seats paid with packs; admins see the packs' figures.
    const sales = (
      await http()
        .get(`/api/v1/organizations/${organization.id}/reports/sales`)
        .set('Authorization', owner.auth)
        .expect(200)
    ).body as SalesReport;
    // Kept: the other direction, day 2 and the late cancel (trip lost); the last trip; the
    // 2 seats cancelled in time do not count.
    expect(sales.totals).toEqual([
      expect.objectContaining({ currency: 'USD', packSeats: 4, seats: 4 }),
    ]);
    const metrics = (
      await http().get('/api/v1/admin/metrics').set('Authorization', admin.auth).expect(200)
    ).body as PlatformMetrics;
    expect(metrics.tripPacks.sold).toEqual(
      expect.arrayContaining([expect.objectContaining({ currency: 'USD' })]),
    );
    expect(metrics.tripPacks.used.find((u) => u.currency === 'USD')!.trips).toBeGreaterThanOrEqual(
      4,
    );
  });
});
