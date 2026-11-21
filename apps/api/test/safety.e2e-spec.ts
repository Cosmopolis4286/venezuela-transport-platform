import { randomInt, randomUUID } from 'node:crypto';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import type {
  AuthResponse,
  FleetVehicle,
  PlatformRole,
  PublicTaxiRide,
  SafetyIncident,
  ShareTaxiRideResponse,
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

const expectDatabase = process.env.E2E_EXPECT_DATABASE === 'true';

/** Safety (ADR-043): sharing a ride with people the passenger trusts, and the emergency button. */
describe.runIf(expectDatabase)('Ride sharing and SOS (e2e)', () => {
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
          email: `safety-${randomUUID()}@example.com`,
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
    'shares a read-only view of the ride and sends emergency alerts to the platform team',
    { timeout: 30_000 },
    async () => {
      const admin = await person('admin');
      const support = await person('support');
      const reviewer = await person('reviewer');
      const db = app.get(DatabaseService).db;

      // A zone with two stops and a motorcycle line whose owner drives.
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
      const a = await stop('Seguro A', 8.3725, -62.642);
      const b = await stop('Seguro B', 8.29, -62.73);
      const zone = (
        await http()
          .post('/api/v1/admin/zones')
          .set('Authorization', admin.auth)
          .send({ name: `Seguro ${run}`, slug: `seguro-${run}`, status: 'active' })
          .expect(201)
      ).body as { id: string };
      for (const s of [a, b]) {
        await http()
          .patch(`/api/v1/admin/stops/${s.id}`)
          .set('Authorization', admin.auth)
          .send({ zoneId: zone.id })
          .expect(200);
      }
      const owner = await person();
      const { organization } = (
        await http()
          .post('/api/v1/organizations')
          .set('Authorization', owner.auth)
          .send({
            type: 'moto_line',
            legalName: `Motos seguras ${run}`,
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
          .send({ plate: `SG${randomInt(100, 999)}OS` })
          .expect(201)
      ).body as FleetVehicle;
      await http()
        .put(`${url}/taxi/stretch-fares`)
        .set('Authorization', owner.auth)
        .send({
          fares: [{ stopIds: [a.id, b.id], mode: 'motorcycle', amount: '2.00', currency: 'USD' }],
        })
        .expect(200);
      await http()
        .put('/api/v1/me/taxi/availability')
        .set('Authorization', owner.auth)
        .send({ online: true })
        .expect(200);
      await http()
        .put('/api/v1/me/taxi/location')
        .set('Authorization', owner.auth)
        .send({ latitude: 8.37, longitude: -62.64 })
        .expect(204);
      // The support team has the transport app for alerts.
      await http()
        .post('/api/v1/me/push-devices')
        .set('Authorization', support.auth)
        .send({
          token: `ExponentPushToken[sos${randomUUID().slice(0, 8)}]`,
          app: 'transport',
          platform: 'android',
          locale: 'es',
        })
        .expect(204);

      // --- The passenger asks for a motorcycle and shares the ride.
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
            address: 'Calle 2, frente a la plaza',
            passengers: 1,
          })
          .expect(201)
      ).body as TaxiRide;
      const share = () =>
        http().post(`/api/v1/me/taxi-rides/${ride.id}/share`).set('Authorization', rider.auth);
      const { path } = (await share().expect(200)).body as ShareTaxiRideResponse;
      expect(path).toMatch(/^\/taxi\/shared\/[A-Za-z0-9_-]{24}$/);
      // The same link every time; nobody else can share this ride.
      expect(((await share().expect(200)).body as ShareTaxiRideResponse).path).toBe(path);
      await http()
        .post(`/api/v1/me/taxi-rides/${ride.id}/share`)
        .set('Authorization', owner.auth)
        .expect(404);
      const token = path.split('/').pop()!;
      const shared = async () =>
        (await http().get(`/api/v1/taxi/shared/${token}`).expect(200)).body as PublicTaxiRide;
      expect(await shared()).toMatchObject({
        status: 'requested',
        canCancel: false,
        canRate: false,
      });
      await http().get('/api/v1/taxi/shared/not-a-real-token-at-all-0000').expect(404);
      // The shared link is not the tracking link: it cannot cancel.
      await http().post(`/api/v1/taxi/track/${token}/cancel`).expect(404);

      // No emergency button before a driver takes the ride.
      const sos = () =>
        http().post(`/api/v1/me/taxi-rides/${ride.id}/sos`).set('Authorization', rider.auth);
      expect(reason(await sos().expect(409))).toBe('TAXI_RIDE_WRONG_STEP');

      // --- The driver takes it: the shared view shows the plate and where the driver is.
      await http()
        .post(`/api/v1/me/taxi/rides/${ride.id}/accept`)
        .set('Authorization', owner.auth)
        .send({ organizationId: organization.id, vehicleId: vehicle.id })
        .expect(200);
      expect(await shared()).toMatchObject({
        status: 'accepted',
        vehicle: { plate: vehicle.plate },
        driverLocation: { latitude: 8.37, longitude: -62.64 },
      });

      // --- The passenger presses the emergency button: once, with the driver's location.
      const alert = (await sos().expect(200)).body as SafetyIncident;
      expect(alert).toMatchObject({
        reporterRole: 'passenger',
        location: { latitude: 8.37, longitude: -62.64 },
        resolvedAt: null,
        ride: { id: ride.id, plate: vehicle.plate, status: 'accepted' },
      });
      expect(alert.ride.passenger.name).toBe('Persona Prueba');
      expect(((await sos().expect(200)).body as SafetyIncident).id).toBe(alert.id);
      await app.get(NotificationsService).settled();
      const alerts = await db
        .select({ kind: notifications.kind, reference: notifications.reference })
        .from(notifications)
        .where(eq(notifications.userId, support.user.id));
      expect(alerts.some((n) => n.kind === 'safety_alert' && n.reference === ride.id)).toBe(true);

      // The driver has their own button; strangers do not.
      const driverAlert = (
        await http()
          .post(`/api/v1/me/taxi/rides/${ride.id}/sos`)
          .set('Authorization', owner.auth)
          .expect(200)
      ).body as SafetyIncident;
      expect(driverAlert.reporterRole).toBe('driver');
      await http()
        .post(`/api/v1/me/taxi/rides/${ride.id}/sos`)
        .set('Authorization', rider.auth)
        .expect(404);

      // --- Only the team with safety.manage sees and attends alerts, writing what they did.
      await http()
        .get('/api/v1/admin/safety-incidents')
        .set('Authorization', reviewer.auth)
        .expect(403);
      const list = (
        await http()
          .get('/api/v1/admin/safety-incidents')
          .set('Authorization', support.auth)
          .expect(200)
      ).body as SafetyIncident[];
      expect(
        list
          .filter((i) => i.ride.id === ride.id)
          .map((i) => i.id)
          .sort(),
      ).toEqual([alert.id, driverAlert.id].sort());
      const resolve = (notes?: string) =>
        http()
          .post(`/api/v1/admin/safety-incidents/${alert.id}/resolve`)
          .set('Authorization', support.auth)
          .send(notes === undefined ? {} : { notes });
      await resolve().expect(400);
      const attended = (await resolve('Llamamos al pasajero: está bien.').expect(200))
        .body as SafetyIncident;
      expect(attended).toMatchObject({ resolvedNotes: 'Llamamos al pasajero: está bien.' });
      expect(reason(await resolve('Otra vez').expect(409))).toBe('RELOAD_AND_RETRY');
      // Attended, the passenger can raise a new one.
      expect(((await sos().expect(200)).body as SafetyIncident).id).not.toBe(alert.id);

      // --- After the ride, the shared link shows how it ended, without location, for 2 hours.
      await http()
        .post(`/api/v1/me/taxi/rides/${ride.id}/pickup`)
        .set('Authorization', owner.auth)
        .expect(200);
      await http()
        .post(`/api/v1/me/taxi/rides/${ride.id}/complete`)
        .set('Authorization', owner.auth)
        .send({})
        .expect(200);
      expect(await shared()).toMatchObject({ status: 'completed', driverLocation: null });
      expect(reason(await share().expect(409))).toBe('TAXI_RIDE_WRONG_STEP');
      await db
        .update(taxiRides)
        .set({ completedAt: new Date(Date.now() - 3 * 3600_000) })
        .where(eq(taxiRides.id, ride.id));
      await http().get(`/api/v1/taxi/shared/${token}`).expect(404);
    },
  );
});
