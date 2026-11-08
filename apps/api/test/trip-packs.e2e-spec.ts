import { randomUUID } from 'node:crypto';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import type {
  AuthResponse,
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
import { tripPacks } from '../src/modules/trip-packs/trip-packs.schema.js';

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
    // Paying again or asking for options of an active pack is refused.
    expect(
      reason(await http().get(optionsUrl).set('Authorization', passenger.auth).expect(409)),
    ).toBe('TRIP_PACK_NOT_AWAITING_PAYMENT');

    // --- An unpaid pack is voided after its payment time; money arriving later is refunded.
    const late = (await buy().expect(201)).body as TripPack;
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
});
