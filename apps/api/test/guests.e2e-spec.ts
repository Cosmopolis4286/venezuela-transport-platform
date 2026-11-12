import { randomInt, randomUUID } from 'node:crypto';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import {
  todayInVenezuela,
  type AdminBookingLookup,
  type AuthResponse,
  type Booking,
  type Route,
  type Stop,
  type UserProfile,
} from '@vtp/shared-types';
import { eq } from 'drizzle-orm';
import request from 'supertest';
import { DatabaseService } from '../src/database/database.service.js';
import { users } from '../src/modules/identity/identity.schema.js';
import { RetentionService } from '../src/modules/retention/retention.service.js';

const expectDatabase = process.env.E2E_EXPECT_DATABASE === 'true';

describe.runIf(expectDatabase)('Guest checkout (e2e)', () => {
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
          email: `guest-${name}-${run}@example.test`,
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
    'buys without registering, keeps the trips when registering and moves them when signing in',
    { timeout: 30_000 },
    async () => {
      const db = app.get(DatabaseService).db;
      const admin = await register('admin');
      const owner = await register('linea');
      const member = await register('socia');
      await db.update(users).set({ platformRole: 'admin' }).where(eq(users.id, admin.user.id));

      // --- A route with a frequency schedule to buy on.
      const stop = async (name: string) =>
        (
          await http()
            .post('/api/v1/admin/stops')
            .set('Authorization', admin.auth)
            .send({
              kind: 'stop',
              name: `${name} ${run}`,
              city: 'Tucupita',
              state: 'Delta Amacuro',
            })
            .expect(201)
        ).body as Stop;
      const a = await stop('Tucupita');
      const b = await stop('Casacoima');
      const { organization } = (
        await http()
          .post('/api/v1/organizations')
          .set('Authorization', owner.auth)
          .send({
            type: 'bus_company',
            legalName: `Línea Delta ${run}`,
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
      const route = (
        await http()
          .post(`${org}/routes`)
          .set('Authorization', owner.auth)
          .send({
            name: `Tucupita – Casacoima ${run}`,
            scope: 'suburban',
            stops: [
              { stopId: a.id, minutesFromOrigin: 0 },
              { stopId: b.id, minutesFromOrigin: 40 },
            ],
          })
          .expect(201)
      ).body as Route;
      await http()
        .put(`${org}/routes/${route.id}/fares`)
        .set('Authorization', owner.auth)
        .send({ fares: [{ fromStopId: a.id, toStopId: b.id, amount: '1.00', currency: 'USD' }] })
        .expect(200);
      const today = todayInVenezuela();
      const tomorrow = new Date(Date.parse(today) + 86_400_000).toISOString().slice(0, 10);
      const created = (
        await http()
          .post(`${org}/routes/${route.id}/schedules`)
          .set('Authorization', owner.auth)
          .send({
            departureTime: '05:00',
            daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
            validFrom: today,
            serviceClass: 'standard',
            seats: 20,
            headwayMinutes: 30,
            lastDepartureTime: '19:00',
          })
          .expect(201)
      ).body as Route;
      await http()
        .post(`${org}/routes/${route.id}/status`)
        .set('Authorization', owner.auth)
        .send({ status: 'active' })
        .expect(200);
      const book = (auth: string) =>
        http()
          .post('/api/v1/bookings')
          .set('Authorization', auth)
          .send({
            scheduleId: created.schedules[0]!.id,
            serviceDate: tomorrow,
            fromStopId: a.id,
            toStopId: b.id,
            contactPhone: '+58 414-765.4321',
            passengers: [
              {
                firstName: 'Carmen',
                lastName: 'Prueba',
                documentType: 'V',
                documentNumber: '9876543',
              },
            ],
          })
          .expect(201)
          .then((res) => res.body as Booking);
      const guest = async () => {
        const body = (
          await http()
            .post('/api/v1/auth/guest')
            .send({ client: 'passenger', acceptTerms: true })
            .expect(201)
        ).body as AuthResponse;
        return { ...body, auth: `Bearer ${body.tokens.accessToken}` };
      };
      const myBookings = (auth: string) =>
        http()
          .get('/api/v1/me/bookings')
          .set('Authorization', auth)
          .then((res) => res.body as Booking[]);

      // --- Buying as a guest: no e-mail, no password; the trip is on the phone.
      await http().post('/api/v1/auth/guest').send({ client: 'passenger' }).expect(400);
      await http()
        .post('/api/v1/auth/guest')
        .send({ client: 'transport', acceptTerms: true })
        .expect(400);
      const first = await guest();
      expect(first.user).toMatchObject({ guest: true, email: null, phone: null });
      const bought = await book(first.auth);
      expect(bought.contactPhone).toBe('+584147654321');
      expect((await myBookings(first.auth)).map((x) => x.id)).toEqual([bought.id]);
      // Support sees the phone the guest left.
      expect(
        (
          (
            await http()
              .get(`/api/v1/admin/bookings/by-code/${bought.code}`)
              .set('Authorization', admin.auth)
              .expect(200)
          ).body as AdminBookingLookup
        ).customer,
      ).toMatchObject({ name: null, email: null, phone: '+584147654321' });
      // Companies and KYC need a real account.
      await http()
        .post('/api/v1/organizations')
        .set('Authorization', first.auth)
        .send({
          type: 'bus_company',
          legalName: `Transporte Invitado ${run}`,
          rif: `J-${randomInt(10_000_000, 99_999_999)}-2`,
        })
        .expect(409)
        .expect((res) => expect(res.body.error.reason).toBe('ACCOUNT_REQUIRED'));

      // --- Registering keeps the trips: the guest becomes the account.
      const upgrade = (auth: string, email: string) =>
        http().post('/api/v1/me/account').set('Authorization', auth).send({
          email,
          password: 'una frase larga de prueba',
          firstName: 'Carmen',
          lastName: 'Prueba',
        });
      await upgrade(first.auth, `guest-socia-${run}@example.test`)
        .expect(409)
        .expect((res) => expect(res.body.error.reason).toBe('EMAIL_TAKEN'));
      const email = `guest-carmen-${run}@example.test`;
      const profile = (await upgrade(first.auth, email).expect(200)).body as UserProfile;
      expect(profile).toMatchObject({ guest: false, email, firstName: 'Carmen' });
      await upgrade(first.auth, `otra-${run}@example.test`)
        .expect(409)
        .expect((res) => expect(res.body.error.reason).toBe('NOT_A_GUEST'));
      const signedIn = (
        await http()
          .post('/api/v1/auth/login')
          .send({ email, password: 'una frase larga de prueba', client: 'passenger' })
          .expect(200)
      ).body as AuthResponse;
      expect((await myBookings(`Bearer ${signedIn.tokens.accessToken}`)).map((x) => x.id)).toEqual([
        bought.id,
      ]);

      // --- Signing in to an existing account on a phone that bought as a guest moves its trips.
      const second = await guest();
      const secondTrip = await book(second.auth);
      const claim = (auth: string, guestAccessToken: string) =>
        http().post('/api/v1/me/claim-guest').set('Authorization', auth).send({ guestAccessToken });
      await claim(second.auth, second.tokens.accessToken)
        .expect(409)
        .expect((res) => expect(res.body.error.reason).toBe('ACCOUNT_REQUIRED'));
      await claim(member.auth, member.tokens.accessToken).expect(404);
      expect((await claim(member.auth, second.tokens.accessToken).expect(200)).body).toEqual({
        bookings: 1,
      });
      expect((await myBookings(member.auth)).map((x) => x.id)).toEqual([secondTrip.id]);
      // The guest is closed: its session no longer works and it cannot be claimed again.
      await http().get('/api/v1/me').set('Authorization', second.auth).expect(401);
      await claim(member.auth, second.tokens.accessToken).expect(404);

      // --- Guests that never bought are removed after a month.
      const idle = await guest();
      await db
        .update(users)
        .set({ createdAt: new Date(Date.now() - 31 * 86_400_000) })
        .where(eq(users.id, idle.user.id));
      const result = await app.get(RetentionService).sweep(new Date());
      expect(result.guests).toBeGreaterThanOrEqual(1);
      expect(await db.select().from(users).where(eq(users.id, idle.user.id))).toEqual([]);
      expect(await db.select().from(users).where(eq(users.id, first.user.id))).toHaveLength(1);
    },
  );
});
