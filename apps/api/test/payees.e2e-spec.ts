import { randomInt, randomUUID } from 'node:crypto';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import type {
  AuthResponse,
  Booking,
  DriverEarnings,
  OrganizationSettlement,
  Payout,
  Route,
  Stop,
} from '@vtp/shared-types';
import { eq } from 'drizzle-orm';
import request from 'supertest';
import { DatabaseService } from '../src/database/database.service.js';
import { trips } from '../src/modules/bookings/bookings.schema.js';
import { users } from '../src/modules/identity/identity.schema.js';
import { settlementEntries } from '../src/modules/settlements/settlements.schema.js';

const expectDatabase = process.env.E2E_EXPECT_DATABASE === 'true';

describe.runIf(expectDatabase)('Who is paid: the line or the driver (e2e)', () => {
  let app: NestExpressApplication;
  const http = () => request(app.getHttpServer());
  const run = randomUUID().slice(0, 8);

  beforeAll(async () => {
    process.env.AUTH_RATE_LIMIT_MAX = '1000';
    process.env.RATE_LIMIT_MAX = '10000';
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

  const register = async (name: string) => {
    const body = (
      await http()
        .post('/api/v1/auth/register')
        .send({
          email: `payee-${name}-${run}@example.test`,
          password: 'una frase larga de prueba',
          firstName: name,
          lastName: 'Prueba',
          client: 'web',
          acceptTerms: true,
        })
        .expect(201)
    ).body as AuthResponse;
    return { ...body, auth: `Bearer ${body.tokens.accessToken}` };
  };

  it(
    'suburban routes pay the trip driver by default, configurable per route',
    { timeout: 30_000 },
    async () => {
      const db = app.get(DatabaseService).db;
      const admin = await register('admin');
      const owner = await register('linea');
      const driver = await register('Carlos');
      const passenger = await register('pasajera');
      await db.update(users).set({ platformRole: 'admin' }).where(eq(users.id, admin.user.id));

      const stop = async (name: string) =>
        (
          await http()
            .post('/api/v1/admin/stops')
            .set('Authorization', admin.auth)
            .send({ kind: 'stop', name: `${name} ${run}`, city: name, state: 'Bolívar' })
            .expect(201)
        ).body as Stop;
      const casacoima = await stop('Casacoima');
      const sanFelix = await stop('San Félix');
      const { organization } = (
        await http()
          .post('/api/v1/organizations')
          .set('Authorization', owner.auth)
          .send({
            type: 'bus_company',
            legalName: `Línea Casacoima ${run}`,
            rif: `J-${randomInt(10_000_000, 99_999_999)}-1`,
          })
          .expect(201)
      ).body as { organization: { id: string } };
      await http()
        .post(`/api/v1/admin/organizations/${organization.id}/review`)
        .set('Authorization', admin.auth)
        .send({ decision: 'approve' })
        .expect(200);
      const org = `/api/v1/organizations/${organization.id}`;
      // A known service fee, so the amounts below are fixed.
      await http()
        .put(`/api/v1/admin/organizations/${organization.id}/policy`)
        .set('Authorization', admin.auth)
        .send({ commissionRate: '15', refundTiers: null })
        .expect(200);

      const routeBody = {
        name: `Casacoima – San Félix ${run}`,
        stops: [
          { stopId: casacoima.id, minutesFromOrigin: 0 },
          { stopId: sanFelix.id, minutesFromOrigin: 60 },
        ],
      };
      // Interurban (the default) pays the line; suburban pays the driver.
      const interurban = (
        await http()
          .post(`${org}/routes`)
          .set('Authorization', owner.auth)
          .send(routeBody)
          .expect(201)
      ).body as Route;
      expect(interurban).toMatchObject({
        scope: 'interurban',
        payeeOverride: null,
        payee: 'organization',
      });
      await http()
        .post(`${org}/routes`)
        .set('Authorization', owner.auth)
        .send({ ...routeBody, name: `${routeBody.name} x`, scope: 'rural' })
        .expect(400);
      const route = (
        await http()
          .post(`${org}/routes`)
          .set('Authorization', owner.auth)
          .send({ ...routeBody, name: `${routeBody.name} urbana`, scope: 'suburban' })
          .expect(201)
      ).body as Route;
      expect(route).toMatchObject({ scope: 'suburban', payeeOverride: null, payee: 'driver' });

      await http()
        .put(`${org}/routes/${route.id}/fares`)
        .set('Authorization', owner.auth)
        .send({
          fares: [
            { fromStopId: casacoima.id, toStopId: sanFelix.id, amount: '0.75', currency: 'USD' },
          ],
        })
        .expect(200);
      const today = new Date(Date.now() - 4 * 3_600_000).toISOString().slice(0, 10);
      const tomorrow = new Date(Date.parse(today) + 86_400_000).toISOString().slice(0, 10);
      const { schedules } = (
        await http()
          .post(`${org}/routes/${route.id}/schedules`)
          .set('Authorization', owner.auth)
          .send({
            departureTime: '05:00',
            daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
            validFrom: today,
            serviceClass: 'standard',
            seats: 30,
          })
          .expect(201)
      ).body as { schedules: { id: string }[] };
      await http()
        .post(`${org}/routes/${route.id}/status`)
        .set('Authorization', owner.auth)
        .send({ status: 'active' })
        .expect(200);

      const buyAndPay = async (seat: string) => {
        const booking = (
          await http()
            .post('/api/v1/bookings')
            .set('Authorization', passenger.auth)
            .send({
              scheduleId: schedules[0]!.id,
              serviceDate: tomorrow,
              fromStopId: casacoima.id,
              toStopId: sanFelix.id,
              passengers: [
                {
                  seatNumber: seat,
                  firstName: 'Rosa',
                  lastName: 'Prueba',
                  documentType: 'V',
                  documentNumber: '18765432',
                },
              ],
            })
            .expect(201)
        ).body as Booking;
        const payment = (
          await http()
            .post(`/api/v1/me/bookings/${booking.id}/payments`)
            .set('Authorization', passenger.auth)
            .send({ method: 'usdt' })
            .expect(201)
        ).body as { id: string };
        await http()
          .post(`/api/v1/me/payments/${payment.id}/simulate`)
          .set('Authorization', passenger.auth)
          .send({})
          .expect(200);
        return booking;
      };
      const settlement = async () =>
        (await http().get(`${org}/settlement`).set('Authorization', owner.auth).expect(200))
          .body as OrganizationSettlement;

      // --- Sold before a driver is assigned: the fare waits for the trip's driver.
      const first = await buyAndPay('1');
      const [entry] = await db
        .select()
        .from(settlementEntries)
        .where(eq(settlementEntries.bookingId, first.id));
      expect(entry).toMatchObject({
        payee: 'driver',
        gross: '0.86',
        commission: '0.11',
        earned: '0.75',
      });
      let current = await settlement();
      expect(current.balances).toEqual([
        expect.objectContaining({
          currency: 'USD',
          earned: '0.00',
          forDrivers: '0.75',
          balance: '0.00',
        }),
      ]);
      expect(current.drivers).toEqual([
        {
          driver: null,
          currency: 'USD',
          earned: '0.75',
          paidOut: '0.00',
          balance: '0.75',
          payoutAccount: null,
        },
      ]);

      // --- Dispatch assigns Carlos: the money is his, and he sees it in the app.
      await db
        .update(trips)
        .set({ driverUserId: driver.user.id })
        .where(eq(trips.id, first.trip.id));
      current = await settlement();
      expect(current.drivers).toEqual([
        expect.objectContaining({
          driver: { id: driver.user.id, name: 'Carlos Prueba' },
          balance: '0.75',
        }),
      ]);
      const earnings = async () =>
        (await http().get('/api/v1/me/earnings').set('Authorization', driver.auth).expect(200))
          .body as DriverEarnings;
      expect(await earnings()).toEqual({
        balances: [
          {
            organization: { id: organization.id, name: `Línea Casacoima ${run}` },
            currency: 'USD',
            earned: '0.75',
            paidOut: '0.00',
            balance: '0.75',
          },
        ],
        payoutAccount: null,
      });

      // He says where to pay him; the platform sees it next to his balance.
      const account = {
        method: 'pago_movil',
        bank: '0102 – Banco de Venezuela',
        account: '0414-1234567',
        holderId: 'v-12345678',
        holderName: 'Carlos Prueba',
      };
      await http()
        .put('/api/v1/me/payout-account')
        .set('Authorization', driver.auth)
        .send({ ...account, method: 'cash' })
        .expect(400);
      await http()
        .put('/api/v1/me/payout-account')
        .set('Authorization', driver.auth)
        .send(account)
        .expect(200);
      expect((await settlement()).drivers[0]!.payoutAccount).toEqual({
        ...account,
        holderId: 'V-12345678',
      });

      // --- The platform pays him: never more than he is owed, and not the line's balance.
      const payDriver = (amount: string, driverUserId = driver.user.id) =>
        http()
          .post(`/api/v1/admin/organizations/${organization.id}/payouts`)
          .set('Authorization', admin.auth)
          .send({
            currency: 'USD',
            amount,
            method: 'pago_movil',
            reference: `PM-${run}`,
            driverUserId,
          });
      await payDriver('0.76')
        .expect(409)
        .expect((res) => expect(res.body.error.reason).toBe('PAYOUT_EXCEEDS_BALANCE'));
      await payDriver('0.10', passenger.user.id).expect(409);
      const paid = (await payDriver('0.75').expect(201)).body as Payout;
      expect(paid).toMatchObject({
        driver: { id: driver.user.id, name: 'Carlos Prueba' },
        amount: '0.75',
      });
      current = await settlement();
      expect(current.drivers[0]).toMatchObject({ paidOut: '0.75', balance: '0.00' });
      expect(current.balances[0]).toMatchObject({ paidOut: '0.00', balance: '0.00' });
      expect((await earnings()).balances[0]).toMatchObject({ balance: '0.00' });

      // --- The line can choose to be paid itself on this route.
      const changed = (
        await http()
          .patch(`${org}/routes/${route.id}`)
          .set('Authorization', owner.auth)
          .send({ payeeOverride: 'organization' })
          .expect(200)
      ).body as Route;
      expect(changed).toMatchObject({
        scope: 'suburban',
        payeeOverride: 'organization',
        payee: 'organization',
      });
      const second = await buyAndPay('2');
      const [secondEntry] = await db
        .select()
        .from(settlementEntries)
        .where(eq(settlementEntries.bookingId, second.id));
      expect(secondEntry!.payee).toBe('organization');
      expect((await settlement()).balances[0]).toMatchObject({
        earned: '0.75',
        forDrivers: '0.75',
        balance: '0.75',
      });
    },
  );
});
