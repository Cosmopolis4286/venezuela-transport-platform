import { randomInt, randomUUID } from 'node:crypto';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import {
  DEFAULT_SUBURBAN_REFUND_TIERS,
  type AuthResponse,
  type Booking,
  type CancellationQuote,
  type Departure,
  type OrganizationMembershipSummary,
  type OtpChallengeResponse,
  type Route,
  type ServiceArea,
  type ServicesSettings,
  type ServicesStatus,
  type Stop,
  type TripAvailability,
} from '@vtp/shared-types';
import { eq, sql } from 'drizzle-orm';
import request from 'supertest';
import { DatabaseService } from '../src/database/database.service.js';
import { bookings } from '../src/modules/bookings/bookings.schema.js';
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

const uniqueRif = () => `J-${randomInt(10_000_000, 99_999_999)}-${randomInt(0, 9)}`;

/**
 * Intercity and suburban services and their switches (ADR-029). Other e2e files run at the same
 * time on the same database, so this one never switches intercity off for everyone: it closes
 * only cities and corridors of its own.
 */
describe.runIf(expectDatabase)('Services and corridors (e2e)', () => {
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
    const email = `svc-e2e-${randomUUID()}@example.com`;
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

  it('sells suburban routes only in active corridors and closes intercity cities', async () => {
    const reviewer = await signIn('reviewer');
    const admin = await signIn('admin');
    const owner = await signIn();
    const passenger = await signIn();

    const stop = async (name: string, city: string) =>
      (
        await http()
          .post('/api/v1/admin/stops')
          .set('Authorization', reviewer.auth)
          .send({ kind: 'stop', name: `${name} ${run}`, city: `${city} ${run}`, state: 'Bolívar' })
          .expect(201)
      ).body as Stop;
    const casacoima = await stop('Parada Casacoima', 'Casacoima');
    const sanFelix = await stop('Terminal San Félix', 'San Félix');
    const puertoOrdaz = await stop('Parada Alta Vista', 'Puerto Ordaz');
    const caracas = await stop('Terminal La Bandera', 'Caracas');

    // --- Corridors: reviewers curate them, only admins switch them on.
    const areasUrl = '/api/v1/admin/service-areas';
    const body = {
      name: `Ciudad Guayana ${run}`,
      stopIds: [casacoima.id, sanFelix.id, puertoOrdaz.id],
    };
    await http().post(areasUrl).set('Authorization', owner.auth).send(body).expect(403);
    expect(
      reason(
        await http()
          .post(areasUrl)
          .set('Authorization', reviewer.auth)
          .send({ ...body, active: true })
          .expect(403),
      ),
    ).toBeUndefined();
    const area = (
      await http().post(areasUrl).set('Authorization', reviewer.auth).send(body).expect(201)
    ).body as ServiceArea;
    expect(area).toMatchObject({ name: body.name, active: false });
    expect(area.stops.map((s) => s.id).sort()).toEqual(body.stopIds.sort());
    expect(
      reason(
        await http().post(areasUrl).set('Authorization', reviewer.auth).send(body).expect(409),
      ),
    ).toBe('SERVICE_AREA_NAME_TAKEN');
    const status = async () =>
      (await http().get('/api/v1/platform/services').expect(200)).body as ServicesStatus;
    expect((await status()).suburban.areas.some((a) => a.id === area.id)).toBe(false);
    const switchArea = (active: boolean) =>
      http().patch(`${areasUrl}/${area.id}`).set('Authorization', admin.auth).send({ active });
    await switchArea(true).expect(200);
    expect((await status()).suburban).toMatchObject({
      enabled: true,
      areas: expect.arrayContaining([expect.objectContaining({ id: area.id })]),
    });
    // Operators see every corridor to prepare routes.
    expect(
      (
        (await http().get('/api/v1/service-areas').set('Authorization', owner.auth).expect(200))
          .body as ServiceArea[]
      ).some((a) => a.id === area.id),
    ).toBe(true);

    // --- An approved bus company publishes a suburban route of the corridor.
    const { organization } = (
      await http()
        .post('/api/v1/organizations')
        .set('Authorization', owner.auth)
        .send({ type: 'bus_company', legalName: `Expresos Guayana ${run}`, rif: uniqueRif() })
        .expect(201)
    ).body as OrganizationMembershipSummary;
    await http()
      .post(`/api/v1/admin/organizations/${organization.id}/review`)
      .set('Authorization', reviewer.auth)
      .send({ decision: 'approve' })
      .expect(200);
    const routesUrl = `/api/v1/organizations/${organization.id}/routes`;
    const createRoute = (extra: object) =>
      http()
        .post(routesUrl)
        .set('Authorization', owner.auth)
        .send({
          name: 'Casacoima – Puerto Ordaz',
          stops: [
            { stopId: casacoima.id, minutesFromOrigin: 0 },
            { stopId: sanFelix.id, minutesFromOrigin: 50 },
            { stopId: puertoOrdaz.id, minutesFromOrigin: 80 },
          ],
          ...extra,
        });
    expect(reason(await createRoute({ service: 'suburban' }).expect(409))).toBe(
      'SERVICE_AREA_REQUIRED',
    );
    expect(
      reason(
        await createRoute({
          service: 'suburban',
          serviceAreaId: area.id,
          stops: [
            { stopId: caracas.id, minutesFromOrigin: 0 },
            { stopId: puertoOrdaz.id, minutesFromOrigin: 600 },
          ],
        }).expect(409),
      ),
    ).toBe('ROUTE_OUTSIDE_SERVICE_AREA');
    const suburban = (
      await createRoute({ service: 'suburban', serviceAreaId: area.id }).expect(201)
    ).body as Route;
    expect(suburban).toMatchObject({ service: 'suburban', serviceAreaId: area.id, mode: 'bus' });
    // An intercity route never belongs to a corridor.
    const intercity = (
      await createRoute({
        name: 'Caracas – Puerto Ordaz',
        serviceAreaId: area.id,
        stops: [
          { stopId: caracas.id, minutesFromOrigin: 0 },
          { stopId: puertoOrdaz.id, minutesFromOrigin: 600 },
        ],
      }).expect(201)
    ).body as Route;
    expect(intercity).toMatchObject({ service: 'intercity', serviceAreaId: null });

    const tomorrow = addDays(todayInVenezuela(), 1);
    const publish = async (route: Route, from: Stop, to: Stop) => {
      const url = `${routesUrl}/${route.id}`;
      await http()
        .put(`${url}/fares`)
        .set('Authorization', owner.auth)
        .send({
          fares: [{ fromStopId: from.id, toStopId: to.id, amount: '2.00', currency: 'USD' }],
        })
        .expect(200);
      const withSchedule = (
        await http()
          .post(`${url}/schedules`)
          .set('Authorization', owner.auth)
          .send({
            departureTime: '06:30',
            daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
            validFrom: tomorrow,
            serviceClass: 'standard',
            seats: 30,
          })
          .expect(201)
      ).body as Route;
      await http()
        .post(`${url}/status`)
        .set('Authorization', owner.auth)
        .send({ status: 'active' })
        .expect(200);
      return withSchedule.schedules[0]!.id;
    };
    const scheduleId = await publish(suburban, casacoima, puertoOrdaz);
    await publish(intercity, caracas, puertoOrdaz);

    const search = (from: Stop, to: Stop, extra: object = {}) =>
      http()
        .get('/api/v1/search/departures')
        .query({ from: from.id, to: to.id, date: tomorrow, ...extra })
        .expect(200)
        .then((res) => res.body as Departure[]);
    expect(await search(casacoima, puertoOrdaz)).toEqual([
      expect.objectContaining({ service: 'suburban', serviceAreaId: area.id, scheduleId }),
    ]);
    expect(await search(casacoima, puertoOrdaz, { service: 'intercity' })).toEqual([]);
    expect(await search(caracas, puertoOrdaz)).toEqual([
      expect.objectContaining({ service: 'intercity', serviceAreaId: null }),
    ]);

    // A stop used by a route of the corridor cannot leave it.
    expect(
      reason(
        await http()
          .patch(`${areasUrl}/${area.id}`)
          .set('Authorization', reviewer.auth)
          .send({ stopIds: [sanFelix.id, puertoOrdaz.id] })
          .expect(409),
      ),
    ).toBe('SERVICE_AREA_STOP_IN_USE');

    // --- Switching the corridor off stops sales, not operations.
    await switchArea(false).expect(200);
    expect(await search(casacoima, puertoOrdaz)).toEqual([]);
    const trip = { scheduleId, serviceDate: tomorrow, from: casacoima.id, to: puertoOrdaz.id };
    expect(
      (
        (await http().get('/api/v1/trips/availability').query(trip).expect(200))
          .body as TripAvailability
      ).bookable,
    ).toBe(false);
    const hold = () =>
      http()
        .post('/api/v1/bookings')
        .set('Authorization', passenger.auth)
        .send({
          scheduleId,
          serviceDate: tomorrow,
          fromStopId: casacoima.id,
          toStopId: puertoOrdaz.id,
          passengers: [
            {
              seatNumber: '1',
              firstName: 'Ana',
              lastName: `Diaria ${run}`,
              documentType: 'V',
              documentNumber: `${randomInt(10_000_000, 30_000_000)}`,
            },
          ],
        });
    expect(reason(await hold().expect(409))).toBe('SERVICE_DISABLED');
    await http().get(routesUrl).set('Authorization', owner.auth).expect(200);
    await switchArea(true).expect(200);
    const held = (await hold().expect(201)).body as Booking;

    // --- Suburban refunds: 100 % from 24 h, 75 % from 2 h, 50 % from 30 min, nothing after.
    const payment = (
      await http()
        .post(`/api/v1/me/bookings/${held.id}/payments`)
        .set('Authorization', passenger.auth)
        .send({ method: 'usdt' })
        .expect(201)
    ).body as { id: string };
    await http()
      .post(`/api/v1/me/payments/${payment.id}/simulate`)
      .set('Authorization', passenger.auth)
      .send({})
      .expect(200);
    const quoteIn = async (interval: string) => {
      await app
        .get(DatabaseService)
        .db.update(bookings)
        .set({ departsAt: sql`now() + ${interval}::interval` })
        .where(eq(bookings.id, held.id));
      return (
        await http()
          .get(`/api/v1/me/bookings/${held.id}/cancellation`)
          .set('Authorization', passenger.auth)
          .expect(200)
      ).body as CancellationQuote;
    };
    expect((await quoteIn('3 hours')).policy).toEqual(DEFAULT_SUBURBAN_REFUND_TIERS);
    expect((await quoteIn('3 hours')).refundPercent).toBe(75);
    expect((await quoteIn('45 minutes')).refundPercent).toBe(50);
    expect(await quoteIn('20 minutes')).toMatchObject({ cancellable: true, refundPercent: 0 });

    // --- Intercity: closing a city hides departures boarding or arriving there.
    const intercityUrl = '/api/v1/admin/services/intercity';
    await http()
      .put(intercityUrl)
      .set('Authorization', reviewer.auth)
      .send({ enabled: true, closedCities: [] })
      .expect(403);
    const closed = (
      await http()
        .put(intercityUrl)
        .set('Authorization', admin.auth)
        .send({ enabled: true, closedCities: [{ city: ` caracas ${run} `, state: 'BOLÍVAR' }] })
        .expect(200)
    ).body as ServicesSettings;
    expect(closed.intercity.closedCities).toEqual([{ city: `caracas ${run}`, state: 'BOLÍVAR' }]);
    expect(await search(caracas, puertoOrdaz)).toEqual([]);
    // The suburban corridor is not affected.
    expect(await search(casacoima, puertoOrdaz)).toHaveLength(1);
    await http()
      .put(intercityUrl)
      .set('Authorization', admin.auth)
      .send({ enabled: true, closedCities: [] })
      .expect(200);
    expect(await search(caracas, puertoOrdaz)).toHaveLength(1);

    // --- Frequent departures: one schedule per departure, grouped in a series.
    const seriesUrl = `${routesUrl}/${suburban.id}/schedule-series`;
    const series = (body: object) =>
      http()
        .post(seriesUrl)
        .set('Authorization', owner.auth)
        .send({
          daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
          validFrom: tomorrow,
          serviceClass: 'standard',
          seats: 30,
          ...body,
        });
    await series({ firstDeparture: '05:00', lastDeparture: '05:10', everyMinutes: 15 }).expect(400);
    await series({ firstDeparture: '05:00', lastDeparture: '20:00', everyMinutes: 2 }).expect(400);
    const withSeries = (
      await series({ firstDeparture: '05:00', lastDeparture: '06:00', everyMinutes: 20 }).expect(
        201,
      )
    ).body as Route;
    const seriesId = withSeries.schedules.find((s) => s.seriesId)!.seriesId!;
    expect(
      withSeries.schedules.filter((s) => s.seriesId === seriesId).map((s) => s.departureTime),
    ).toEqual(['05:00', '05:20', '05:40', '06:00']);
    const times = async () =>
      (await search(casacoima, puertoOrdaz)).map((d) => d.departsAt.slice(11, 16));
    expect(await times()).toEqual(['05:00', '05:20', '05:40', '06:00', '06:30']);
    await http()
      .patch(`${seriesUrl}/${seriesId}`)
      .set('Authorization', owner.auth)
      .send({ active: false })
      .expect(200);
    expect(await times()).toEqual(['06:30']);
    // Deleting keeps nothing that was not booked.
    const afterDelete = (
      await http().delete(`${seriesUrl}/${seriesId}`).set('Authorization', owner.auth).expect(200)
    ).body as Route;
    expect(afterDelete.schedules.some((s) => s.seriesId === seriesId)).toBe(false);
    await http().delete(`${seriesUrl}/${seriesId}`).set('Authorization', owner.auth).expect(404);
  });
  it('lets motorcycle taxi lines run suburban routes with one passenger per motorcycle', async () => {
    const reviewer = await signIn('reviewer');
    const owner = await signIn();
    const stop = async (name: string) =>
      (
        await http()
          .post('/api/v1/admin/stops')
          .set('Authorization', reviewer.auth)
          .send({ kind: 'stop', name: `${name} ${run}`, city: `${name} ${run}`, state: 'Bolívar' })
          .expect(201)
      ).body as Stop;
    const sanFelix = await stop('Moto San Félix');
    const puertoOrdaz = await stop('Moto Puerto Ordaz');
    const area = (
      await http()
        .post('/api/v1/admin/service-areas')
        .set('Authorization', reviewer.auth)
        .send({ name: `Mototaxis ${run}`, stopIds: [sanFelix.id, puertoOrdaz.id] })
        .expect(201)
    ).body as ServiceArea;

    const { organization } = (
      await http()
        .post('/api/v1/organizations')
        .set('Authorization', owner.auth)
        .send({ type: 'moto_line', legalName: `Mototaxis Caroní ${run}`, rif: uniqueRif() })
        .expect(201)
    ).body as OrganizationMembershipSummary;
    expect(organization.type).toBe('moto_line');
    const org = `/api/v1/organizations/${organization.id}`;
    const stops = [
      { stopId: sanFelix.id, minutesFromOrigin: 0 },
      { stopId: puertoOrdaz.id, minutesFromOrigin: 25 },
    ];
    const createRoute = (extra: object) =>
      http()
        .post(`${org}/routes`)
        .set('Authorization', owner.auth)
        .send({ name: 'San Félix – Puerto Ordaz', stops, ...extra });
    // Suburban only, and the corridor is required.
    expect(reason(await createRoute({ service: 'intercity' }).expect(409))).toBe(
      'SERVICE_NOT_ALLOWED',
    );
    expect(reason(await createRoute({}).expect(409))).toBe('SERVICE_AREA_REQUIRED');
    expect(reason(await createRoute({ serviceAreaId: area.id, mode: 'car' }).expect(409))).toBe(
      'TRANSPORT_MODE_NOT_ALLOWED',
    );
    const route = (await createRoute({ serviceAreaId: area.id }).expect(201)).body as Route;
    expect(route).toMatchObject({ mode: 'motorcycle', service: 'suburban' });

    // One passenger per motorcycle: one seat, no seat map.
    const schedule = (body: object) =>
      http()
        .post(`${org}/routes/${route.id}/schedules`)
        .set('Authorization', owner.auth)
        .send({
          departureTime: '06:00',
          daysOfWeek: [1, 2, 3, 4, 5],
          validFrom: addDays(todayInVenezuela(), 1),
          serviceClass: 'standard',
          ...body,
        });
    expect(reason(await schedule({ seats: 2 }).expect(409))).toBe('MOTORCYCLE_ONE_PASSENGER');
    const withSchedule = (await schedule({}).expect(201)).body as Route;
    expect(withSchedule.schedules[0]).toMatchObject({ seats: 1, seatLayoutId: null });

    const moto = (
      await http()
        .post(`${org}/vehicles`)
        .set('Authorization', owner.auth)
        .send({ plate: `MT${randomInt(100, 999)}AB` })
        .expect(201)
    ).body as { mode: string; seatLayout: unknown };
    expect(moto).toMatchObject({ mode: 'motorcycle', seatLayout: null });
    // Motorcycle taxi lines have no terminal taxi board.
    await http().get(`${org}/taxi`).set('Authorization', owner.auth).expect(409);
  });
});
