import { randomInt, randomUUID } from 'node:crypto';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import type {
  AuthResponse,
  DriverTaxiBoard,
  FleetVehicle,
  PlatformRole,
  Stop,
  TaxiRide,
} from '@vtp/shared-types';
import { eq } from 'drizzle-orm';
import request from 'supertest';
import { DatabaseService } from '../src/database/database.service.js';
import { users } from '../src/modules/identity/identity.schema.js';
import { notifications } from '../src/modules/notifications/notifications.schema.js';
import { NotificationsService } from '../src/modules/notifications/notifications.service.js';
import { taxiRides } from '../src/modules/taxi/taxi.schema.js';
import { TaxiService } from '../src/modules/taxi/taxi.service.js';

const expectDatabase = process.env.E2E_EXPECT_DATABASE === 'true';

/** Nearby first (ADR-041): drivers' locations, offering requests to the closest, arrival estimate. */
describe.runIf(expectDatabase)('Nearby drivers first (e2e)', () => {
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

  const person = async (platformRole?: PlatformRole) => {
    const res = (
      await http()
        .post('/api/v1/auth/register')
        .send({
          email: `nearby-${randomUUID()}@example.com`,
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
    'offers a request first to the online drivers near the pickup, then to everyone',
    { timeout: 30_000 },
    async () => {
      const admin = await person('admin');
      const db = app.get(DatabaseService).db;

      // Two stops of an active zone, 13 km apart, with their coordinates.
      const stop = async (name: string, latitude: number, longitude: number) =>
        (
          await http()
            .post('/api/v1/admin/stops')
            .set('Authorization', admin.auth)
            .send({
              kind: 'stop',
              name: `${name} ${run}`,
              city: `${name} ${run}`,
              state: 'Bolívar',
              latitude,
              longitude,
            })
            .expect(201)
        ).body as Stop;
      const a = await stop('Cerca A', 8.3725, -62.642);
      const b = await stop('Cerca B', 8.29, -62.73);
      const zone = (
        await http()
          .post('/api/v1/admin/zones')
          .set('Authorization', admin.auth)
          .send({ name: `Cerca ${run}`, slug: `cerca-${run}`, status: 'active' })
          .expect(201)
      ).body as { id: string };
      for (const s of [a, b]) {
        await http()
          .patch(`/api/v1/admin/stops/${s.id}`)
          .set('Authorization', admin.auth)
          .send({ zoneId: zone.id })
          .expect(200);
      }

      // Two motorcycle lines whose owners drive, both with a fare for the stretch.
      const line = async () => {
        const owner = await person();
        const { organization } = (
          await http()
            .post('/api/v1/organizations')
            .set('Authorization', owner.auth)
            .send({
              type: 'moto_line',
              legalName: `Motos cerca ${run} ${randomInt(1000, 9999)}`,
              rif: `J-${randomInt(10_000_000, 99_999_999)}-${randomInt(0, 9)}`,
            })
            .expect(201)
        ).body as { organization: { id: string } };
        await http()
          .post(`/api/v1/admin/organizations/${organization.id}/review`)
          .set('Authorization', admin.auth)
          .send({ decision: 'approve' })
          .expect(200);
        const url = `/api/v1/organizations/${organization.id}`;
        const vehicle = (
          await http()
            .post(`${url}/vehicles`)
            .set('Authorization', owner.auth)
            .send({ plate: `NB${randomInt(100, 999)}AB` })
            .expect(201)
        ).body as FleetVehicle;
        await http()
          .put(`${url}/taxi/stretch-fares`)
          .set('Authorization', owner.auth)
          .send({
            fares: [{ stopIds: [a.id, b.id], mode: 'motorcycle', amount: '2.00', currency: 'USD' }],
          })
          .expect(200);
        // Their transport app is registered for push (console delivery in tests).
        await http()
          .post('/api/v1/me/push-devices')
          .set('Authorization', owner.auth)
          .send({
            token: `ExponentPushToken[near${randomUUID().slice(0, 8)}]`,
            app: 'transport',
            platform: 'android',
            locale: 'es',
          })
          .expect(204);
        return { id: organization.id, owner, vehicle };
      };
      const [near, far] = [await line(), await line()];
      const locate = (auth: string, latitude: number, longitude: number) =>
        http()
          .put('/api/v1/me/taxi/location')
          .set('Authorization', auth)
          .send({ latitude, longitude });
      const online = (auth: string, on = true) =>
        http().put('/api/v1/me/taxi/availability').set('Authorization', auth).send({ online: on });

      // The location is shared only while online.
      expect(reason(await locate(near.owner.auth, 8.38, -62.64).expect(409))).toBe(
        'DRIVER_OFFLINE',
      );
      await locate(near.owner.auth, 91, 0).expect(400);
      await online(near.owner.auth).expect(200);
      await online(far.owner.auth).expect(200);
      await locate(near.owner.auth, 8.38, -62.64).expect(204); // ~1 km from A
      await locate(far.owner.auth, 8.29, -62.73).expect(204); // ~13 km from A

      // --- A ride from A, for now: only the nearby driver sees it and hears about it.
      const rider = await person();
      const ride = (
        await http()
          .post('/api/v1/me/taxi-rides')
          .set('Authorization', rider.auth)
          .send({
            kind: 'stretch',
            fromStopId: a.id,
            toStopId: b.id,
            mode: 'motorcycle',
            address: 'Calle 1, casa verde',
            passengers: 1,
          })
          .expect(201)
      ).body as TaxiRide;
      const board = async (auth: string) =>
        (await http().get('/api/v1/me/taxi').set('Authorization', auth).expect(200))
          .body as DriverTaxiBoard;
      const seen = (await board(near.owner.auth)).requests.find((r) => r.id === ride.id);
      expect(seen?.distanceKm).toBeGreaterThan(0.5);
      expect(seen?.distanceKm).toBeLessThan(2);
      expect((await board(far.owner.auth)).requests.some((r) => r.id === ride.id)).toBe(false);
      await app.get(NotificationsService).settled();
      const heard = async (userId: string) =>
        (
          await db
            .select({ reference: notifications.reference })
            .from(notifications)
            .where(eq(notifications.userId, userId))
        ).some((n) => n.reference === ride.id);
      expect(await heard(near.owner.user.id)).toBe(true);
      expect(await heard(far.owner.user.id)).toBe(false);

      // --- Nobody near took it in time: everyone online sees it, and the rest hear about it.
      await db
        .update(taxiRides)
        .set({ createdAt: new Date(Date.now() - 60_000) })
        .where(eq(taxiRides.id, ride.id));
      expect(await app.get(TaxiService).widenRequests()).toBeGreaterThanOrEqual(1);
      await app.get(NotificationsService).settled();
      expect(await heard(far.owner.user.id)).toBe(true);
      expect(
        (await board(far.owner.auth)).requests.find((r) => r.id === ride.id)?.distanceKm,
      ).toBeGreaterThan(10);

      // --- The nearby driver takes it: the passenger sees them coming, with an estimate.
      await http()
        .post(`/api/v1/me/taxi/rides/${ride.id}/accept`)
        .set('Authorization', near.owner.auth)
        .send({ organizationId: near.id, vehicleId: near.vehicle.id })
        .expect(200);
      const mine = (
        await http()
          .get(`/api/v1/me/taxi-rides/${ride.id}`)
          .set('Authorization', rider.auth)
          .expect(200)
      ).body as TaxiRide;
      expect(mine.driverApproach).toMatchObject({ latitude: 8.38, longitude: -62.64 });
      expect(mine.driverApproach!.distanceKm).toBeLessThan(2);
      expect(mine.driverApproach!.etaMinutes).toBeGreaterThanOrEqual(1);
      // The map shows where they pick the passenger up: the ride's first stop.
      expect(mine.driverApproach!.pickup).toEqual({ latitude: 8.3725, longitude: -62.642 });

      // Going offline erases the location: the passenger no longer sees it.
      await online(near.owner.auth, false).expect(200);
      expect(
        (
          (
            await http()
              .get(`/api/v1/me/taxi-rides/${ride.id}`)
              .set('Authorization', rider.auth)
              .expect(200)
          ).body as TaxiRide
        ).driverApproach,
      ).toBeNull();
    },
  );
});
