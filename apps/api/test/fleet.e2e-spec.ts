import { randomInt, randomUUID } from 'node:crypto';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import {
  presetLayout,
  type AuthResponse,
  type OrganizationMembershipSummary,
  type OtpChallengeResponse,
  type Route,
  type SeatLayout,
  type Stop,
} from '@vtp/shared-types';
import { eq } from 'drizzle-orm';
import request from 'supertest';
import { DatabaseService } from '../src/database/database.service.js';
import { users } from '../src/modules/identity/identity.schema.js';
import type { OtpMessage, OtpSender } from '../src/modules/identity/otp/otp-sender.js';
import { todayInVenezuela } from '../src/modules/network/departures.js';

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

describe.runIf(expectDatabase)('Seat layouts (e2e)', () => {
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

  const signIn = async (email = `fleet-e2e-${randomUUID()}@example.com`) => {
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

  const organization = async (auth: string, type: string) =>
    (
      (
        await http()
          .post('/api/v1/organizations')
          .set('Authorization', auth)
          .send({
            type,
            legalName: `Flota ${run}`,
            rif: `J-${randomInt(10_000_000, 99_999_999)}-${randomInt(0, 9)}`,
          })
          .expect(201)
      ).body as OrganizationMembershipSummary
    ).organization;

  it('manages seat layouts and ties schedule capacity to them', async () => {
    const owner = await signIn();
    const company = await organization(owner.auth, 'bus_company');
    const layoutsUrl = `/api/v1/organizations/${company.id}/seat-layouts`;
    const post = (body: object) =>
      http().post(layoutsUrl).set('Authorization', owner.auth).send(body);

    // Validation: shape (DTO) and the layout as a whole (shared rules, Spanish message).
    await post({ name: 'X' }).expect(400);
    const clash = await post({
      name: 'Choque',
      decks: 1,
      rows: 2,
      columns: 3,
      seats: [
        { number: '1', deck: 0, row: 0, column: 0 },
        { number: '2', deck: 0, row: 0, column: 0 },
      ],
    }).expect(400);
    expect(clash.body.error.message).toBe('Hay dos puestos en la misma casilla.');
    await post({
      name: 'Fuera',
      decks: 1,
      rows: 2,
      columns: 3,
      seats: [{ number: '1', deck: 0, row: 5, column: 0 }],
    }).expect(400);

    const sleeper = (await post(presetLayout('sleeper_2_1')).expect(201)).body as SeatLayout;
    expect(sleeper).toMatchObject({ name: 'Buscama 2-1', capacity: 30, scheduleCount: 0 });
    const coach = (await post({ ...presetLayout('coach_2_2'), name: 'Coach' }).expect(201))
      .body as SeatLayout;
    expect(coach.capacity).toBe(44);

    // Other organizations: 404; drivers read but do not edit; terminals have no layouts.
    const stranger = await signIn();
    await http().get(`${layoutsUrl}/${sleeper.id}`).set('Authorization', stranger.auth).expect(404);
    const terminal = await organization(stranger.auth, 'terminal');
    await http()
      .post(`/api/v1/organizations/${terminal.id}/seat-layouts`)
      .set('Authorization', stranger.auth)
      .send(presetLayout('car_4'))
      .expect(409);

    // A schedule on that layout takes its capacity.
    const reviewer = await signIn();
    await app
      .get(DatabaseService)
      .db.update(users)
      .set({ platformRole: 'reviewer' })
      .where(eq(users.id, reviewer.user.id));
    const stop = async (name: string) =>
      (
        await http()
          .post('/api/v1/admin/stops')
          .set('Authorization', reviewer.auth)
          .send({ kind: 'terminal', name: `${name} ${run}`, city: name, state: 'Estado' })
          .expect(201)
      ).body as Stop;
    const [from, to] = [await stop('Mérida'), await stop('Barinas')];
    const route = (
      await http()
        .post(`/api/v1/organizations/${company.id}/routes`)
        .set('Authorization', owner.auth)
        .send({
          name: 'Mérida – Barinas',
          stops: [
            { stopId: from.id, minutesFromOrigin: 0 },
            { stopId: to.id, minutesFromOrigin: 240 },
          ],
        })
        .expect(201)
    ).body as Route;
    const schedulesUrl = `/api/v1/organizations/${company.id}/routes/${route.id}/schedules`;
    const base = {
      departureTime: '07:00',
      daysOfWeek: [1, 3, 5],
      validFrom: todayInVenezuela(),
      serviceClass: 'sleeper',
    };
    await http().post(schedulesUrl).set('Authorization', owner.auth).send(base).expect(400);
    await http()
      .post(schedulesUrl)
      .set('Authorization', owner.auth)
      .send({ ...base, seatLayoutId: randomUUID() })
      .expect(404);
    const scheduled = (
      await http()
        .post(schedulesUrl)
        .set('Authorization', owner.auth)
        .send({ ...base, seats: 99, seatLayoutId: sleeper.id })
        .expect(201)
    ).body as Route;
    const schedule = scheduled.schedules[0]!;
    expect(schedule).toMatchObject({ seats: 30, seatLayoutId: sleeper.id });

    // Editing the layout updates the schedule; a layout in use cannot be deleted.
    const smaller = presetLayout('sleeper_2_1').seats.slice(0, 27);
    const edited = (
      await http()
        .patch(`${layoutsUrl}/${sleeper.id}`)
        .set('Authorization', owner.auth)
        .send({ seats: smaller })
        .expect(200)
    ).body as SeatLayout;
    expect(edited).toMatchObject({ capacity: 27, scheduleCount: 1, name: 'Buscama 2-1' });
    const routeAfter = (
      await http()
        .get(`/api/v1/organizations/${company.id}/routes/${route.id}`)
        .set('Authorization', owner.auth)
        .expect(200)
    ).body as Route;
    expect(routeAfter.schedules[0]!.seats).toBe(27);
    await http().delete(`${layoutsUrl}/${sleeper.id}`).set('Authorization', owner.auth).expect(409);

    // Moving the schedule to another layout, then back to a plain seat count.
    const moved = (
      await http()
        .patch(`${schedulesUrl}/${schedule.id}`)
        .set('Authorization', owner.auth)
        .send({ seatLayoutId: coach.id })
        .expect(200)
    ).body as Route;
    expect(moved.schedules[0]).toMatchObject({ seats: 44, seatLayoutId: coach.id });
    const plain = (
      await http()
        .patch(`${schedulesUrl}/${schedule.id}`)
        .set('Authorization', owner.auth)
        .send({ seatLayoutId: null, seats: 20 })
        .expect(200)
    ).body as Route;
    expect(plain.schedules[0]).toMatchObject({ seats: 20, seatLayoutId: null });
    await http().delete(`${layoutsUrl}/${sleeper.id}`).set('Authorization', owner.auth).expect(204);

    const listed = (await http().get(layoutsUrl).set('Authorization', owner.auth).expect(200))
      .body as SeatLayout[];
    expect(listed.map((l) => l.name)).toEqual(['Coach']);
  });
});
