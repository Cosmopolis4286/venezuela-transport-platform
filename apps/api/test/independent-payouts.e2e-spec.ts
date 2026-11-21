import { randomInt, randomUUID } from 'node:crypto';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import type {
  AuthResponse,
  DriverEarnings,
  DriverPayoutRun,
  IndependentCommission,
  IndependentLine,
  Organization,
  OrganizationMembershipSummary,
  Payout,
  PendingDriverPayout,
  PlatformRole,
  Stop,
} from '@vtp/shared-types';
import { and, eq } from 'drizzle-orm';
import request from 'supertest';
import { DatabaseService } from '../src/database/database.service.js';
import { vehicles } from '../src/modules/fleet/fleet.schema.js';
import { users } from '../src/modules/identity/identity.schema.js';
import { notifications } from '../src/modules/notifications/notifications.schema.js';
import { NotificationsService } from '../src/modules/notifications/notifications.service.js';
import { memberships } from '../src/modules/organizations/organizations.schema.js';
import {
  independentCommissionAt,
  recordRideCommission,
  recordRideEarning,
} from '../src/modules/settlements/ledger.js';
import { IndependentPayoutsService } from '../src/modules/settlements/independent-payouts.service.js';
import { taxiRides } from '../src/modules/taxi/taxi.schema.js';

const expectDatabase = process.env.E2E_EXPECT_DATABASE === 'true';
const uniqueRif = () => `J-${randomInt(10_000_000, 99_999_999)}-${randomInt(0, 9)}`;

/** Independent drivers' commission, debt and weekly payouts (ADR-045). */
describe.runIf(expectDatabase)('Independent commission and payouts (e2e)', () => {
  let app: NestExpressApplication;
  const http = () => request(app.getHttpServer());
  const run = randomUUID().slice(0, 8);

  beforeAll(async () => {
    process.env.AUTH_RATE_LIMIT_MAX = '1000';
    process.env.RATE_LIMIT_MAX = '10000';
    // Payouts wait for finance to transfer them, as in production.
    process.env.PAYOUT_PROVIDER = 'manual';
    const { AppModule } = await import('../src/app.module.js');
    const { configureApp } = await import('../src/app.setup.js');
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>();
    configureApp(app);
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  const person = async (platformRole?: PlatformRole) => {
    const res = (
      await http()
        .post('/api/v1/auth/register')
        .send({
          email: `payouts-${randomUUID()}@example.com`,
          password: 'una frase larga de prueba',
          firstName: 'Persona',
          lastName: 'Prueba',
          client: 'transport',
          acceptTerms: true,
        })
        .expect(201)
    ).body as AuthResponse;
    if (platformRole) {
      await app
        .get(DatabaseService)
        .db.update(users)
        .set({ platformRole })
        .where(eq(users.id, res.user.id));
    }
    return { auth: `Bearer ${res.tokens.accessToken}`, user: res.user };
  };
  const reason = (res: request.Response) =>
    (res.body as { error: { reason?: string } }).error.reason;

  it(
    'announces commission raises, keeps indebted drivers offline and pays the rest weekly',
    { timeout: 30_000 },
    async () => {
      const [admin, finance, reviewer] = [
        await person('admin'),
        await person('finance'),
        await person('reviewer'),
      ];
      const db = app.get(DatabaseService).db;

      // The platform's car line and an independent driver with a car and a payout account.
      const first = await http()
        .post('/api/v1/admin/independent-lines')
        .set('Authorization', admin.auth)
        .send({
          type: 'taxi_line',
          legalName: `VTP Taxis ${run}`,
          tradeName: 'VTP',
          rif: uniqueRif(),
        });
      let line: Organization;
      if (first.status === 201) {
        line = (first.body as OrganizationMembershipSummary).organization;
      } else {
        expect(reason(first)).toBe('INDEPENDENT_LINE_EXISTS');
        line = (
          (
            await http()
              .get('/api/v1/admin/independent-lines')
              .set('Authorization', admin.auth)
              .expect(200)
          ).body as IndependentLine[]
        ).find((l) => l.organization.type === 'taxi_line')!.organization;
      }
      const driver = await person();
      await db
        .insert(memberships)
        .values({ organizationId: line.id, userId: driver.user.id, role: 'driver' });
      const [car] = await db
        .insert(vehicles)
        .values({
          organizationId: line.id,
          plate: `PG${randomInt(100, 999)}OS`,
          mode: 'car',
          ownerUserId: driver.user.id,
        })
        .returning({ id: vehicles.id });
      await http()
        .put('/api/v1/me/payout-account')
        .set('Authorization', driver.auth)
        .send({
          method: 'pago_movil',
          bank: '0102 – Banco de Venezuela',
          account: '0414-7654321',
          holderId: 'V-23456789',
          holderName: 'Ana Independiente',
        })
        .expect(200);

      // --- A raise is announced: it starts in 30 days, and the drivers hear about it.
      const commission = () =>
        http().put('/api/v1/admin/independent-commission').set('Authorization', finance.auth);
      await http()
        .get('/api/v1/admin/independent-commission')
        .set('Authorization', reviewer.auth)
        .expect(403);
      const before = (
        await http()
          .get('/api/v1/admin/independent-commission')
          .set('Authorization', finance.auth)
          .expect(200)
      ).body as IndependentCommission;
      await commission().send({ rate: '150' }).expect(400);
      const announced = (await commission().send({ rate: '12.5' }).expect(200))
        .body as IndependentCommission;
      expect(announced.rate).toBe(before.rate);
      expect(announced.next?.rate).toBe('12.50');
      const startsIn = new Date(announced.next!.from).getTime() - Date.now();
      expect(startsIn).toBeGreaterThan(29.9 * 86_400_000);
      expect(await independentCommissionAt(db, new Date(Date.now() + 31 * 86_400_000))).toBe(
        '12.50',
      );
      const earnings = async () =>
        (await http().get('/api/v1/me/earnings').set('Authorization', driver.auth).expect(200))
          .body as DriverEarnings;
      expect((await earnings()).commission).toMatchObject({ next: { rate: '12.50' } });
      await app.get(NotificationsService).settled();
      const heard = async (kind: 'commission_changed' | 'payout_sent') =>
        (
          await db
            .select({ id: notifications.id })
            .from(notifications)
            .where(
              and(
                eq(notifications.userId, driver.user.id),
                eq(notifications.kind, kind),
                eq(notifications.channel, 'email'),
              ),
            )
        ).length;
      expect(await heard('commission_changed')).toBe(1);
      // Going back to what applies today cancels the announcement at once.
      expect((await commission().send({ rate: before.rate }).expect(200)).body).toEqual({
        rate: before.rate,
        next: null,
      });

      // --- Finished rides of this driver: a cash one and one the platform collected.
      const stop = async (name: string) =>
        (
          await http()
            .post('/api/v1/admin/stops')
            .set('Authorization', admin.auth)
            .send({ kind: 'stop', name: `${name} ${run}`, city: `${name} ${run}`, state: 'Lara' })
            .expect(201)
        ).body as Stop;
      const [a, b] = [await stop('Pagos A'), await stop('Pagos B')];
      const zone = (
        await http()
          .post('/api/v1/admin/zones')
          .set('Authorization', admin.auth)
          .send({ name: `Pagos ${run}`, slug: `pagos-${run}`, status: 'active' })
          .expect(201)
      ).body as { id: string };
      const rider = await person();
      const ride = async (fare: string) => {
        const [row] = await db
          .insert(taxiRides)
          .values({
            passengerUserId: rider.user.id,
            kind: 'stretch',
            fromStopId: a.id,
            toStopId: b.id,
            zoneId: zone.id,
            mode: 'car',
            address: 'Calle 4',
            passengers: 1,
            status: 'completed',
            expiresAt: new Date(),
            organizationId: line.id,
            driverUserId: driver.user.id,
            vehicleId: car!.id,
            fareAmount: fare,
            fareCurrency: 'USD',
            completedAt: new Date(),
          })
          .returning();
        return {
          id: row!.id,
          organizationId: line.id,
          passengers: 1,
          fareAmount: fare,
          fareCurrency: 'USD' as const,
          tripPackId: null,
        };
      };
      // A 300.00 cash ride at 10 %: the driver owes 30.00, above the 20.00 limit.
      const cash = await ride('300.00');
      await db.transaction((tx) => recordRideCommission(tx, cash, '10.00'));
      await db.transaction((tx) => recordRideCommission(tx, cash, '10.00')); // once per ride
      expect((await earnings()).balances).toEqual([
        expect.objectContaining({ earned: '-30.00', balance: '-30.00', currency: 'USD' }),
      ]);
      const online = () =>
        http()
          .put('/api/v1/me/taxi/availability')
          .set('Authorization', driver.auth)
          .send({ online: true });
      expect(reason(await online().expect(409))).toBe('DRIVER_DEBT_LIMIT');

      // --- They pay it: never recorded for more than they owe; then they can go online.
      const collect = (amount: string) =>
        http()
          .post(`/api/v1/admin/organizations/${line.id}/payouts`)
          .set('Authorization', finance.auth)
          .send({
            direction: 'from_operator',
            driverUserId: driver.user.id,
            currency: 'USD',
            amount,
            method: 'pago_movil',
            reference: `COB-${run}`,
          });
      expect(reason(await collect('30.01').expect(409))).toBe('COLLECTION_EXCEEDS_DEBT');
      await collect('30.00').expect(201);
      expect((await earnings()).balances[0]).toMatchObject({
        collected: '30.00',
        balance: '0.00',
      });
      await online().expect(200);

      // --- A ride the platform collected credits the fare minus 10 %: 45.00 owed to the driver.
      const packRide = await ride('50.00');
      await db.transaction((tx) => recordRideEarning(tx, packRide, 'driver', '10.00'));
      expect((await earnings()).balances[0]).toMatchObject({ balance: '45.00' });

      // --- The weekly run creates a pending payout to their account, once per week.
      const payouts = app.get(IndependentPayoutsService);
      const runResult: DriverPayoutRun = await payouts.run();
      expect(runResult.created).toBeGreaterThanOrEqual(1);
      expect(runResult.sent).toBe(0);
      await payouts.run();
      const pending = (
        (
          await http()
            .get('/api/v1/admin/driver-payouts/pending')
            .set('Authorization', finance.auth)
            .expect(200)
        ).body as PendingDriverPayout[]
      ).filter((p) => p.driver?.id === driver.user.id);
      expect(pending).toEqual([
        expect.objectContaining({
          amount: '45.00',
          status: 'pending',
          automatic: true,
          method: 'pago_movil',
          account: expect.objectContaining({ account: '0414-7654321' }),
        }),
      ]);
      // Pending, it already counts: nothing left to pay twice.
      expect((await earnings()).balances[0]).toMatchObject({
        pending: '45.00',
        paidOut: '45.00',
        balance: '0.00',
      });

      // --- Finance transfers it and types the reference; the driver hears about it.
      const sent = (reference?: string) =>
        http()
          .post(`/api/v1/admin/payouts/${pending[0]!.id}/sent`)
          .set('Authorization', finance.auth)
          .send(reference === undefined ? {} : { reference });
      await sent().expect(400);
      expect(((await sent('REF-987').expect(200)).body as Payout).status).toBe('sent');
      expect(reason(await sent('REF-987').expect(409))).toBe('PAYOUT_NOT_PENDING');
      expect((await earnings()).balances[0]).toMatchObject({ pending: '0.00', balance: '0.00' });
      await app.get(NotificationsService).settled();
      expect(await heard('payout_sent')).toBe(1);
    },
  );
});
