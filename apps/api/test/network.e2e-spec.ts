import { randomInt, randomUUID } from 'node:crypto';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import type {
  AuthResponse,
  Departure,
  OrganizationMembershipSummary,
  OtpChallengeResponse,
  ReceivedInvitation,
  Route,
  RouteSummary,
  Stop,
} from '@vtp/shared-types';
import { eq } from 'drizzle-orm';
import request from 'supertest';
import { DatabaseService } from '../src/database/database.service.js';
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

describe.runIf(expectDatabase)('Transport network (e2e)', () => {
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

  const signIn = async (email = `net-e2e-${randomUUID()}@example.com`) => {
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
    return { auth: `Bearer ${res.tokens.accessToken}`, user: res.user, email };
  };

  const makeReviewer = async (userId: string) => {
    await app
      .get(DatabaseService)
      .db.update(users)
      .set({ platformRole: 'reviewer' })
      .where(eq(users.id, userId));
  };

  const createOrganization = async (auth: string, type: string) =>
    (
      await http()
        .post('/api/v1/organizations')
        .set('Authorization', auth)
        .send({ type, legalName: `Expresos Red ${run}`, rif: uniqueRif() })
        .expect(201)
    ).body as OrganizationMembershipSummary;

  it('publishes a route with fares and schedules and finds its departures', async () => {
    // --- Stop catalog (platform staff) -------------------------------------------------------
    const reviewer = await signIn();
    await makeReviewer(reviewer.user.id);
    const owner = await signIn();
    const createStop = (auth: string, body: object) =>
      http().post('/api/v1/admin/stops').set('Authorization', auth).send(body);
    await createStop(owner.auth, { kind: 'terminal', name: 'X', city: 'Y', state: 'Z' }).expect(
      403,
    );

    const stop = async (kind: string, name: string, city: string, state: string, extra = {}) =>
      (
        await createStop(reviewer.auth, {
          kind,
          name: `${name} ${run}`,
          city,
          state,
          ...extra,
        }).expect(201)
      ).body as Stop;
    const caracas = await stop('terminal', 'Terminal La Bandera', 'Caracas', 'Distrito Capital', {
      latitude: 10.4806,
      longitude: -66.9036,
    });
    expect(caracas).toMatchObject({ latitude: 10.4806, longitude: -66.9036, active: true });
    const valencia = await stop('stop', 'Parada Big Low', 'Valencia', 'Carabobo');
    const maracaibo = await stop('terminal', 'Terminal de Maracaibo', 'Maracaibo', 'Zulia');
    const closed = await stop('stop', 'Parada Cerrada', 'Tinaquillo', 'Cojedes', { active: false });

    await createStop(reviewer.auth, {
      kind: 'terminal',
      name: `terminal la bandera ${run}`,
      city: 'CARACAS',
      state: 'Distrito Capital',
    }).expect(409);
    await createStop(reviewer.auth, {
      kind: 'stop',
      name: `Sin longitud ${run}`,
      city: 'Coro',
      state: 'Falcón',
      latitude: 11.4,
    }).expect(400);

    const found = (await http().get('/api/v1/stops').query({ q: run }).expect(200)).body as Stop[];
    expect(found.map((s) => s.id).sort()).toEqual([caracas.id, valencia.id, maracaibo.id].sort());
    const staffView = (
      await http().get('/api/v1/admin/stops').query({ q: run }).set('Authorization', reviewer.auth)
    ).body as Stop[];
    expect(staffView.map((s) => s.id)).toContain(closed.id);
    const moved = await http()
      .patch(`/api/v1/admin/stops/${valencia.id}`)
      .set('Authorization', reviewer.auth)
      .send({ address: 'Autopista Regional del Centro' })
      .expect(200);
    expect(moved.body).toMatchObject({
      name: valencia.name,
      address: 'Autopista Regional del Centro',
    });

    // --- Route (bus company) -----------------------------------------------------------------
    const { organization } = await createOrganization(owner.auth, 'bus_company');
    const routesUrl = `/api/v1/organizations/${organization.id}/routes`;
    const createRoute = (body: object) =>
      http().post(routesUrl).set('Authorization', owner.auth).send(body);
    const stopsList = (...pairs: [Stop, number][]) =>
      pairs.map(([s, minutes]) => ({ stopId: s.id, minutesFromOrigin: minutes }));

    await createRoute({ name: 'Mala', stops: stopsList([caracas, 10], [maracaibo, 600]) }).expect(
      400,
    );
    await createRoute({ name: 'Mala', stops: stopsList([caracas, 0], [valencia, 0]) }).expect(400);
    await createRoute({ name: 'Mala', stops: stopsList([caracas, 0], [caracas, 60]) }).expect(400);
    await createRoute({ name: 'Mala', stops: stopsList([caracas, 0], [closed, 60]) }).expect(400);

    const route = (
      await createRoute({
        name: 'Caracas – Maracaibo',
        stops: stopsList([caracas, 0], [valencia, 120], [maracaibo, 600]),
      }).expect(201)
    ).body as Route;
    expect(route.status).toBe('draft');
    expect(route.stops.map((s) => [s.stop.city, s.minutesFromOrigin])).toEqual([
      ['Caracas', 0],
      ['Valencia', 120],
      ['Maracaibo', 600],
    ]);
    const routeUrl = `${routesUrl}/${route.id}`;

    // Terminals do not run routes; strangers do not see them; drivers can read, not edit.
    const terminalOwner = await signIn();
    const terminal = await createOrganization(terminalOwner.auth, 'terminal');
    await http()
      .post(`/api/v1/organizations/${terminal.organization.id}/routes`)
      .set('Authorization', terminalOwner.auth)
      .send({ name: 'Terminal a Valencia', stops: stopsList([caracas, 0], [valencia, 60]) })
      .expect(409);
    await http().get(routeUrl).set('Authorization', terminalOwner.auth).expect(404);

    const driver = await signIn();
    await http()
      .post(`/api/v1/organizations/${organization.id}/invitations`)
      .set('Authorization', owner.auth)
      .send({ contactKind: 'email', destination: driver.email, role: 'driver' })
      .expect(201);
    const [invitation] = (
      await http().get('/api/v1/me/invitations').set('Authorization', driver.auth).expect(200)
    ).body as ReceivedInvitation[];
    await http()
      .post(`/api/v1/me/invitations/${invitation!.id}/accept`)
      .set('Authorization', driver.auth)
      .expect(204);
    const listed = (await http().get(routesUrl).set('Authorization', driver.auth).expect(200))
      .body as RouteSummary[];
    expect(listed).toEqual([
      expect.objectContaining({
        id: route.id,
        stopCount: 3,
        scheduleCount: 0,
        origin: expect.objectContaining({ id: caracas.id }),
        destination: expect.objectContaining({ id: maracaibo.id }),
      }),
    ]);
    await http()
      .post(`${routeUrl}/schedules`)
      .set('Authorization', driver.auth)
      .send({})
      .expect(403);

    // --- Fares and schedules -----------------------------------------------------------------
    const fares = (body: object) =>
      http().put(`${routeUrl}/fares`).set('Authorization', owner.auth).send(body);
    await fares({
      fares: [{ fromStopId: maracaibo.id, toStopId: caracas.id, amount: '30', currency: 'USD' }],
    }).expect(400);
    await fares({
      fares: [{ fromStopId: caracas.id, toStopId: maracaibo.id, amount: '-1', currency: 'USD' }],
    }).expect(400);
    const priced = (
      await fares({
        fares: [
          { fromStopId: valencia.id, toStopId: maracaibo.id, amount: '22.5', currency: 'USD' },
          { fromStopId: caracas.id, toStopId: maracaibo.id, amount: '30.00', currency: 'USD' },
          { fromStopId: caracas.id, toStopId: valencia.id, amount: '900', currency: 'VES' },
        ],
      }).expect(200)
    ).body as Route;
    expect(priced.fares.map((f) => `${f.amount} ${f.currency}`)).toEqual([
      '900.00 VES',
      '30.00 USD',
      '22.50 USD',
    ]);

    const status = (value: string) =>
      http().post(`${routeUrl}/status`).set('Authorization', owner.auth).send({ status: value });
    await status('active').expect(409); // no schedule yet

    const tomorrow = addDays(todayInVenezuela(), 1);
    const schedule = (body: object) =>
      http().post(`${routeUrl}/schedules`).set('Authorization', owner.auth).send(body);
    await schedule({
      departureTime: '25:00',
      daysOfWeek: [1],
      validFrom: tomorrow,
      serviceClass: 'executive',
      seats: 40,
    }).expect(400);
    await schedule({
      departureTime: '22:00',
      daysOfWeek: [1],
      validFrom: tomorrow,
      validUntil: todayInVenezuela(),
      serviceClass: 'executive',
      seats: 40,
    }).expect(400);
    const scheduled = (
      await schedule({
        departureTime: '22:00',
        daysOfWeek: [6, 0, 1, 2, 3, 4, 5],
        validFrom: tomorrow,
        serviceClass: 'sleeper',
        seats: 36,
      }).expect(201)
    ).body as Route;
    expect(scheduled.schedules).toEqual([
      expect.objectContaining({
        departureTime: '22:00',
        daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
        validUntil: null,
        active: true,
      }),
    ]);
    const morning = (
      await schedule({
        departureTime: '07:15',
        daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
        validFrom: tomorrow,
        serviceClass: 'standard',
        seats: 42,
        active: false,
      }).expect(201)
    ).body as Route;
    const morningId = morning.schedules.find((s) => s.departureTime === '07:15')!.id;

    await status('active').expect(409); // organization still pending review
    await makeReviewer(reviewer.user.id);
    await http()
      .post(`/api/v1/admin/organizations/${organization.id}/review`)
      .set('Authorization', reviewer.auth)
      .send({ decision: 'approve' })
      .expect(200);
    expect(((await status('active').expect(200)).body as Route).status).toBe('active');
    await status('draft').expect(409);

    // --- Public search -----------------------------------------------------------------------
    const search = (from: Stop, to: Stop, date: string) =>
      http().get('/api/v1/search/departures').query({ from: from.id, to: to.id, date });
    const direct = (await search(caracas, maracaibo, tomorrow).expect(200)).body as Departure[];
    expect(direct).toEqual([
      expect.objectContaining({
        serviceDate: tomorrow,
        departsAt: `${tomorrow}T22:00:00-04:00`,
        arrivesAt: `${addDays(tomorrow, 1)}T08:00:00-04:00`,
        durationMinutes: 600,
        serviceClass: 'sleeper',
        seats: 36,
        fare: { amount: '30.00', currency: 'USD' },
        operator: expect.objectContaining({ id: organization.id }),
        route: { id: route.id, name: 'Caracas – Maracaibo' },
      }),
    ]);
    // Valencia is reached at midnight: that service belongs to the previous day's departure.
    const fromValencia = (await search(valencia, maracaibo, addDays(tomorrow, 1)).expect(200))
      .body as Departure[];
    expect(fromValencia).toEqual([
      expect.objectContaining({
        serviceDate: tomorrow,
        departsAt: `${addDays(tomorrow, 1)}T00:00:00-04:00`,
        fare: { amount: '22.50', currency: 'USD' },
      }),
    ]);
    expect((await search(valencia, maracaibo, tomorrow).expect(200)).body).toEqual([]);
    expect((await search(maracaibo, caracas, tomorrow).expect(200)).body).toEqual([]);
    await search(caracas, caracas, tomorrow).expect(400);
    await search(caracas, maracaibo, addDays(todayInVenezuela(), -1)).expect(400);

    // Enabling the morning schedule adds a departure.
    await http()
      .patch(`${routeUrl}/schedules/${morningId}`)
      .set('Authorization', owner.auth)
      .send({ active: true })
      .expect(200);
    const both = (await search(caracas, maracaibo, tomorrow).expect(200)).body as Departure[];
    expect(both.map((d) => d.departsAt.slice(11, 16))).toEqual(['07:15', '22:00']);

    // --- Editing ----------------------------------------------------------------------------
    // Dropping Valencia drops the fares that used it.
    const shortened = (
      await http()
        .patch(routeUrl)
        .set('Authorization', owner.auth)
        .send({ stops: stopsList([caracas, 0], [maracaibo, 570]) })
        .expect(200)
    ).body as Route;
    expect(shortened.fares).toEqual([
      { fromStopId: caracas.id, toStopId: maracaibo.id, amount: '30.00', currency: 'USD' },
    ]);
    await http()
      .delete(`${routeUrl}/schedules/${morningId}`)
      .set('Authorization', owner.auth)
      .expect(200);

    await http().delete(routeUrl).set('Authorization', owner.auth).expect(409);
    await status('inactive').expect(200);
    expect((await search(caracas, maracaibo, tomorrow).expect(200)).body).toEqual([]);

    const draft = (
      await createRoute({
        name: 'Borrador',
        stops: stopsList([valencia, 0], [maracaibo, 480]),
      }).expect(201)
    ).body as Route;
    await http().delete(`${routesUrl}/${draft.id}`).set('Authorization', owner.auth).expect(204);
  });
});
