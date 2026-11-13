import { randomInt, randomUUID } from 'node:crypto';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import type {
  AuthResponse,
  OrganizationMembershipSummary,
  OtpChallengeResponse,
  Route,
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

/** Motorcycle taxi lines (`moto_line`): suburban routes, one passenger per motorcycle. */
describe.runIf(expectDatabase)('Motorcycle taxi lines (e2e)', () => {
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
    const email = `moto-e2e-${randomUUID()}@example.com`;
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
    // Suburban only (the default for these lines), and only motorcycles.
    expect(reason(await createRoute({ scope: 'interurban' }).expect(409))).toBe(
      'SERVICE_NOT_ALLOWED',
    );
    expect(reason(await createRoute({ mode: 'car' }).expect(409))).toBe(
      'TRANSPORT_MODE_NOT_ALLOWED',
    );
    const route = (await createRoute({}).expect(201)).body as Route;
    expect(route).toMatchObject({ mode: 'motorcycle', scope: 'suburban' });
    expect(
      reason(
        await http()
          .patch(`${org}/routes/${route.id}`)
          .set('Authorization', owner.auth)
          .send({ scope: 'interurban' })
          .expect(409),
      ),
    ).toBe('SERVICE_NOT_ALLOWED');

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
  });
});
