import { randomInt, randomUUID } from 'node:crypto';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import type {
  AuthResponse,
  DriverSuspension,
  DriverTaxiBoard,
  IndependentLine,
  Organization,
  OrganizationMembershipSummary,
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
import { taxiRides } from '../src/modules/taxi/taxi.schema.js';

const expectDatabase = process.env.E2E_EXPECT_DATABASE === 'true';
const uniqueRif = () => `J-${randomInt(10_000_000, 99_999_999)}-${randomInt(0, 9)}`;

/** Driver quality from ratings (ADR-044): warnings, suspension of independents and its review. */
describe.runIf(expectDatabase)('Driver quality (e2e)', () => {
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
          email: `quality-${randomUUID()}@example.com`,
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
    'warns drivers with a low average and suspends independents until the team reviews it',
    { timeout: 30_000 },
    async () => {
      const [admin, reviewer] = [await person('admin'), await person('reviewer')];
      const db = app.get(DatabaseService).db;

      // The platform's car line, a zone with two stops, and an independent driver with a car.
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
      const stop = async (name: string) =>
        (
          await http()
            .post('/api/v1/admin/stops')
            .set('Authorization', admin.auth)
            .send({ kind: 'stop', name: `${name} ${run}`, city: `${name} ${run}`, state: 'Lara' })
            .expect(201)
        ).body as Stop;
      const [a, b] = [await stop('Calidad A'), await stop('Calidad B')];
      const zone = (
        await http()
          .post('/api/v1/admin/zones')
          .set('Authorization', admin.auth)
          .send({ name: `Calidad ${run}`, slug: `calidad-${run}`, status: 'active' })
          .expect(201)
      ).body as { id: string };
      const driver = await person();
      await db
        .insert(memberships)
        .values({ organizationId: line.id, userId: driver.user.id, role: 'driver' });
      const [car] = await db
        .insert(vehicles)
        .values({
          organizationId: line.id,
          plate: `CQ${randomInt(100, 999)}AL`,
          mode: 'car',
          ownerUserId: driver.user.id,
        })
        .returning({ id: vehicles.id });
      const online = () =>
        http()
          .put('/api/v1/me/taxi/availability')
          .set('Authorization', driver.auth)
          .send({ online: true });
      await online().expect(200);
      const board = async () =>
        (await http().get('/api/v1/me/taxi').set('Authorization', driver.auth).expect(200))
          .body as DriverTaxiBoard;
      expect((await board()).rating).toEqual({ average: null, count: 0 });

      // Finished rides of this driver: `rated` already rated, plus one the passenger rates now.
      const rider = await person();
      let minutesAgo = 600;
      const rides = async (ratings: number[]) => {
        const rows = await db
          .insert(taxiRides)
          .values(
            [...ratings, null].map((rating) => ({
              passengerUserId: rider.user.id,
              kind: 'stretch' as const,
              fromStopId: a.id,
              toStopId: b.id,
              zoneId: zone.id,
              mode: 'car' as const,
              address: 'Calle 3',
              passengers: 1,
              status: 'completed' as const,
              expiresAt: new Date(),
              organizationId: line.id,
              driverUserId: driver.user.id,
              vehicleId: car!.id,
              fareAmount: '3.00',
              fareCurrency: 'USD' as const,
              completedAt: new Date(),
              rating,
              ratedAt: rating === null ? null : new Date(Date.now() - (minutesAgo -= 1) * 60_000),
            })),
          )
          .returning({ id: taxiRides.id, rating: taxiRides.rating });
        return rows.find((r) => r.rating === null)!.id;
      };
      const rate = (rideId: string, rating: number, comment?: string) =>
        http()
          .post(`/api/v1/me/taxi-rides/${rideId}/rate`)
          .set('Authorization', rider.auth)
          .send({ rating, comment })
          .expect(200);
      const heard = async () => {
        await app.get(NotificationsService).settled();
        return (
          await db
            .select({ id: notifications.id })
            .from(notifications)
            .where(
              and(
                eq(notifications.userId, driver.user.id),
                eq(notifications.kind, 'driver_quality'),
                eq(notifications.channel, 'email'),
              ),
            )
        ).length;
      };

      // --- Nine ratings of 4 do not count yet; the tenth makes an average of 4.0: a warning.
      await rate(await rides([4, 4, 4, 4, 4, 4, 4, 4]), 4);
      expect(await heard()).toBe(0);
      await rate(await rides([]), 4);
      expect((await board()).rating).toEqual({ average: 4, count: 10 });
      expect(await heard()).toBe(1);
      expect((await board()).online).toBe(true);
      // Warned once a month at most.
      await rate(await rides([]), 4);
      expect(await heard()).toBe(1);

      // --- Several bad rides: below 4.0 the independent is suspended and taken offline.
      await rate(await rides([2, 2, 2, 2, 2]), 1, 'Manejó muy rápido.');
      const suspended = await board();
      expect(suspended.online).toBe(false);
      expect(suspended.suspension).toMatchObject({ average: suspended.rating.average });
      expect(suspended.rating.average).toBeLessThan(4);
      expect(suspended.lines).toEqual([]);
      expect(reason(await online().expect(409))).toBe('DRIVER_SUSPENDED');
      expect(await heard()).toBe(2);

      // --- The platform team reviews it with the low comments, and lifts it with a note.
      await http()
        .get('/api/v1/admin/driver-suspensions')
        .set('Authorization', reviewer.auth)
        .expect(403);
      const list = (
        await http()
          .get('/api/v1/admin/driver-suspensions')
          .set('Authorization', admin.auth)
          .expect(200)
      ).body as DriverSuspension[];
      const mine = list.find((s) => s.driver.userId === driver.user.id)!;
      expect(mine).toMatchObject({ liftedAt: null, line: { id: line.id }, ratings: 17 });
      expect(mine.comments).toEqual([
        expect.objectContaining({ rating: 1, comment: 'Manejó muy rápido.' }),
      ]);
      const lift = (notes?: string) =>
        http()
          .post(`/api/v1/admin/driver-suspensions/${mine.id}/lift`)
          .set('Authorization', admin.auth)
          .send(notes === undefined ? {} : { notes });
      await lift().expect(400);
      await lift('Conversamos con él y tomó el curso de manejo').expect(204);
      await lift('Otra vez').expect(404);
      expect(await heard()).toBe(3);

      // Back on the road, starting over: earlier ratings no longer count.
      await online().expect(200);
      const after = await board();
      expect(after.suspension).toBeNull();
      expect(after.rating).toEqual({ average: null, count: 0 });
    },
  );
});
