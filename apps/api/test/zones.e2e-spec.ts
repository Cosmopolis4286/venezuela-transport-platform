import { randomInt, randomUUID } from 'node:crypto';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import type { AuthResponse, Booking, NearbyStop, OperatingZone, Stop } from '@vtp/shared-types';
import { eq } from 'drizzle-orm';
import request from 'supertest';
import { DatabaseService } from '../src/database/database.service.js';
import { users } from '../src/modules/identity/identity.schema.js';
import { settlementEntries } from '../src/modules/settlements/settlements.schema.js';

const expectDatabase = process.env.E2E_EXPECT_DATABASE === 'true';

describe.runIf(expectDatabase)('Operating zones (e2e)', () => {
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
          email: `zones-${name}-${run}@example.test`,
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

  it('a zone decides whether its stops sell, and its commission applies to sales there', async () => {
    const db = app.get(DatabaseService).db;
    const admin = await register('admin');
    const reviewer = await register('revisor');
    const owner = await register('duena');
    const passenger = await register('pasajera');
    await db.update(users).set({ platformRole: 'admin' }).where(eq(users.id, admin.user.id));
    await db.update(users).set({ platformRole: 'reviewer' }).where(eq(users.id, reviewer.user.id));

    // --- Only admins open zones; the slug and name are unique. Each run uses its own area, so
    // zones left by earlier runs in a shared database never catch these stops.
    const lat = 8 + randomInt(0, 50_000) / 100_000;
    const lng = -63 + randomInt(0, 50_000) / 100_000;
    const zoneBody = {
      name: `Eje San Félix ${run}`,
      slug: `san-felix-${run}`,
      defaultCurrency: 'USD',
      commissionRate: '15.00',
      latitude: lat,
      longitude: lng,
      radiusKm: 40,
    };
    await http()
      .post('/api/v1/admin/zones')
      .set('Authorization', reviewer.auth)
      .send(zoneBody)
      .expect(403);
    await http()
      .post('/api/v1/admin/zones')
      .set('Authorization', admin.auth)
      .send({ ...zoneBody, longitude: undefined })
      .expect(400);
    const zone = (
      await http()
        .post('/api/v1/admin/zones')
        .set('Authorization', admin.auth)
        .send(zoneBody)
        .expect(201)
    ).body as OperatingZone;
    expect(zone).toMatchObject({ status: 'coming_soon', commissionRate: '15.00', radiusKm: 40 });
    const duplicate = await http()
      .post('/api/v1/admin/zones')
      .set('Authorization', admin.auth)
      .send({ ...zoneBody, slug: `otra-${run}` })
      .expect(409);
    expect(duplicate.body.error.reason).toBe('ZONE_NAME_TAKEN');

    // --- Stops inside the area join the zone by themselves; one outside does not.
    const stop = async (name: string, latitude: number, longitude: number) =>
      (
        await http()
          .post('/api/v1/admin/stops')
          .set('Authorization', reviewer.auth)
          .send({
            kind: 'terminal',
            name: `${name} ${run}`,
            city: name,
            state: 'Bolívar',
            latitude,
            longitude,
          })
          .expect(201)
      ).body as Stop;
    const sanFelix = await stop('San Félix', lat + 0.001, lng);
    const elTriunfo = await stop('El Triunfo', lat + 0.003, lng);
    const caracas = await stop('Caracas', 10.48, -66.9);
    expect([sanFelix.zoneId, elTriunfo.zoneId, caracas.zoneId]).toEqual([zone.id, zone.id, null]);

    // A route in the zone, ready to sell.
    const { organization } = (
      await http()
        .post('/api/v1/organizations')
        .set('Authorization', owner.auth)
        .send({
          type: 'bus_company',
          legalName: `Expresos Bolívar ${run}`,
          rif: `J-${randomInt(10_000_000, 99_999_999)}-1`,
        })
        .expect(201)
    ).body as { organization: { id: string } };
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
        .send({
          name: 'Buseta',
          decks: 1,
          rows: 2,
          columns: 2,
          seats: ['1', '2', '3', '4'].map((number, i) => ({
            number,
            deck: 0,
            row: Math.floor(i / 2),
            column: i % 2,
          })),
        })
        .expect(201)
    ).body as { id: string };
    const route = (
      await http()
        .post(`${org}/routes`)
        .set('Authorization', owner.auth)
        .send({
          name: `El Triunfo – San Félix ${run}`,
          stops: [
            { stopId: elTriunfo.id, minutesFromOrigin: 0 },
            { stopId: sanFelix.id, minutesFromOrigin: 30 },
          ],
        })
        .expect(201)
    ).body as { id: string };
    await http()
      .put(`${org}/routes/${route.id}/fares`)
      .set('Authorization', owner.auth)
      .send({
        fares: [
          { fromStopId: elTriunfo.id, toStopId: sanFelix.id, amount: '0.75', currency: 'USD' },
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
          departureTime: '06:00',
          daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
          validFrom: today,
          serviceClass: 'standard',
          seatLayoutId: layout.id,
        })
        .expect(201)
    ).body as { schedules: { id: string }[] };
    await http()
      .post(`${org}/routes/${route.id}/status`)
      .set('Authorization', owner.auth)
      .send({ status: 'active' })
      .expect(200);

    const search = () =>
      http()
        .get('/api/v1/search/departures')
        .query({ from: elTriunfo.id, to: sanFelix.id, date: tomorrow })
        .expect(200);
    const book = () =>
      http()
        .post('/api/v1/bookings')
        .set('Authorization', passenger.auth)
        .send({
          scheduleId: schedules[0]!.id,
          serviceDate: tomorrow,
          fromStopId: elTriunfo.id,
          toStopId: sanFelix.id,
          passengers: [
            {
              seatNumber: '1',
              firstName: 'Rosa',
              lastName: 'Prueba',
              documentType: 'V',
              documentNumber: '18765432',
            },
          ],
        });
    const publicStops = async () =>
      ((await http().get('/api/v1/stops').query({ q: run }).expect(200)).body as Stop[]).map(
        (s) => s.id,
      );

    // --- Coming soon: listed, but nothing sells and its stops are not offered.
    const listed = (await http().get('/api/v1/zones').expect(200)).body as OperatingZone[];
    expect(listed.find((z) => z.id === zone.id)?.status).toBe('coming_soon');
    expect((await search()).body).toEqual([]);
    expect((await book().expect(409)).body.error.reason).toBe('ZONE_NOT_ACTIVE');
    expect(await publicStops()).toEqual([caracas.id]);

    // --- One click: active. Search, nearby stops and bookings work.
    const opened = (
      await http()
        .patch(`/api/v1/admin/zones/${zone.id}`)
        .set('Authorization', admin.auth)
        .send({ status: 'active' })
        .expect(200)
    ).body as OperatingZone;
    expect(opened).toMatchObject({ status: 'active', stopCount: 2, commissionRate: '15.00' });
    expect((await search()).body).toHaveLength(1);
    expect((await publicStops()).sort()).toEqual([sanFelix.id, elTriunfo.id, caracas.id].sort());
    const near = (
      await http()
        .get('/api/v1/stops/nearby')
        .query({ latitude: lat, longitude: lng, radiusKm: 20 })
        .expect(200)
    ).body as NearbyStop[];
    const ours = near.filter((s) => s.name.endsWith(run));
    expect(ours.map((s) => s.id)).toEqual([sanFelix.id, elTriunfo.id]);
    expect(ours[0]!.distanceKm).toBeLessThan(1);
    await http().get('/api/v1/stops/nearby').query({ latitude: 200, longitude: 0 }).expect(400);

    // The sale pays the zone's commission (15 %), not the platform's.
    const booking = (await book().expect(201)).body as Booking;
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
    const [entry] = await db
      .select()
      .from(settlementEntries)
      .where(eq(settlementEntries.bookingId, booking.id));
    expect(entry).toMatchObject({
      commissionRate: '15.00',
      gross: '0.75',
      commission: '0.11',
      earned: '0.64',
    });

    // --- Paused (e.g. a strike): gone from the public list and from search.
    await http()
      .patch(`/api/v1/admin/zones/${zone.id}`)
      .set('Authorization', admin.auth)
      .send({ status: 'paused' })
      .expect(200);
    const afterPause = (await http().get('/api/v1/zones').expect(200)).body as OperatingZone[];
    expect(afterPause.some((z) => z.id === zone.id)).toBe(false);
    expect((await search()).body).toEqual([]);
    const admins = (
      await http().get('/api/v1/admin/zones').set('Authorization', reviewer.auth).expect(200)
    ).body as OperatingZone[];
    expect(admins.find((z) => z.id === zone.id)?.status).toBe('paused');
  });
});
