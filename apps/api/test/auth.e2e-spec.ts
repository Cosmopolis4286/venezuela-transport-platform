import { randomInt, randomUUID } from 'node:crypto';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import type { AuthResponse, OtpChallengeResponse } from '@vtp/shared-types';
import request from 'supertest';
import type { OtpMessage, OtpSender } from '../src/modules/identity/otp/otp-sender.js';

// Full sign-in flows against the real database (run `pnpm db:migrate` first).
const expectDatabase = process.env.E2E_EXPECT_DATABASE === 'true';

/** Captures codes instead of delivering them. */
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

const uniqueEmail = () => `e2e-${randomUUID()}@example.com`;
/** Random Venezuelan mobile in local format, and its E.164 form. */
const uniquePhone = () => {
  const digits = String(randomInt(1_000_000, 9_999_999));
  return { local: `0412-${digits}`, e164: `+58412${digits}` };
};
const PASSWORD = 'una-clave-larga-y-segura';

describe.runIf(expectDatabase)('Authentication (e2e)', () => {
  let app: NestExpressApplication;
  const otp = new CapturingOtpSender();
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    // ConfigModule reads the environment on first import of AppModule (imports are hoisted).
    process.env.AUTH_RATE_LIMIT_MAX = '1000';
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

  const register = async (email = uniqueEmail()) => {
    const res = await http()
      .post('/api/v1/auth/register')
      .send({
        email,
        password: PASSWORD,
        firstName: 'María',
        lastName: 'Pérez',
        client: 'passenger',
      })
      .expect(201);
    return { email, body: res.body as AuthResponse };
  };

  const otpLogin = async (destination: string, channel: 'sms' | 'email' = 'sms') => {
    const challenge = (
      await http().post('/api/v1/auth/otp/request').send({ channel, destination }).expect(202)
    ).body as OtpChallengeResponse;
    return challenge;
  };

  describe('e-mail + password', () => {
    it('registers, normalizes the e-mail and rejects duplicates', async () => {
      const email = uniqueEmail();
      const { body } = await register(email.toUpperCase());
      expect(body.user).toMatchObject({ email, emailVerified: false, firstName: 'María' });
      expect(body.tokens.accessToken).toMatch(/^vtp_at_/);
      expect(body.tokens.refreshToken).toMatch(/^vtp_rt_/);

      const dup = await http()
        .post('/api/v1/auth/register')
        .send({ email, password: PASSWORD, firstName: 'A', lastName: 'B', client: 'web' })
        .expect(409);
      expect(dup.body.error.code).toBe('CONFLICT');
    });

    it('rejects short passwords with field details', async () => {
      const res = await http()
        .post('/api/v1/auth/register')
        .send({
          email: uniqueEmail(),
          password: 'corta',
          firstName: 'A',
          lastName: 'B',
          client: 'web',
        })
        .expect(400);
      expect(res.body.error.code).toBe('VALIDATION_FAILED');
      expect(res.body.error.details).toEqual(
        expect.arrayContaining([expect.objectContaining({ field: 'password' })]),
      );
      expect(JSON.stringify(res.body)).not.toContain('corta');
    });

    it('logs in, and gives the same error for a wrong password or unknown e-mail', async () => {
      const { email } = await register();
      const ok = await http()
        .post('/api/v1/auth/login')
        .send({ email, password: PASSWORD, client: 'web' })
        .expect(200);
      expect(ok.body.user.email).toBe(email);

      for (const attempt of [
        { email, password: 'clave-equivocada-123' },
        { email: uniqueEmail(), password: PASSWORD },
      ]) {
        const res = await http()
          .post('/api/v1/auth/login')
          .send({ ...attempt, client: 'web' })
          .expect(401);
        expect(res.body.error).toMatchObject({
          code: 'INVALID_CREDENTIALS',
          message: 'Invalid credentials',
        });
      }
    });
  });

  describe('sessions', () => {
    it('protects routes by default', async () => {
      const missing = await http().get('/api/v1/me').expect(401);
      expect(missing.body.error.code).toBe('UNAUTHORIZED');
      const invalid = await http()
        .get('/api/v1/me')
        .set('Authorization', 'Bearer vtp_at_nope')
        .expect(401);
      expect(invalid.body.error.code).toBe('SESSION_EXPIRED');
    });

    it('returns and updates the profile', async () => {
      const { body } = await register();
      const auth = `Bearer ${body.tokens.accessToken}`;
      const me = await http().get('/api/v1/me').set('Authorization', auth).expect(200);
      expect(me.body.id).toBe(body.user.id);
      const updated = await http()
        .patch('/api/v1/me')
        .set('Authorization', auth)
        .send({ firstName: '  Ana ' })
        .expect(200);
      expect(updated.body).toMatchObject({ firstName: 'Ana', lastName: 'Pérez' });
    });

    it('rotates tokens on refresh and revokes the session when a used refresh token is replayed', async () => {
      const { body } = await register();
      const first = body.tokens;

      const refreshed = (
        await http()
          .post('/api/v1/auth/refresh')
          .send({ refreshToken: first.refreshToken })
          .expect(200)
      ).body as AuthResponse;
      expect(refreshed.tokens.refreshToken).not.toBe(first.refreshToken);
      // The old access token stops working once rotated.
      await http()
        .get('/api/v1/me')
        .set('Authorization', `Bearer ${first.accessToken}`)
        .expect(401);
      await http()
        .get('/api/v1/me')
        .set('Authorization', `Bearer ${refreshed.tokens.accessToken}`)
        .expect(200);

      // Replaying the first refresh token (theft) kills the whole session.
      const replay = await http()
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: first.refreshToken })
        .expect(401);
      expect(replay.body.error.code).toBe('SESSION_EXPIRED');
      await http()
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: refreshed.tokens.refreshToken })
        .expect(401);
      await http()
        .get('/api/v1/me')
        .set('Authorization', `Bearer ${refreshed.tokens.accessToken}`)
        .expect(401);
    });

    it('logs out the current session only', async () => {
      const { email, body } = await register();
      const other = (
        await http()
          .post('/api/v1/auth/login')
          .send({ email, password: PASSWORD, client: 'web' })
          .expect(200)
      ).body as AuthResponse;

      await http()
        .post('/api/v1/auth/logout')
        .set('Authorization', `Bearer ${body.tokens.accessToken}`)
        .expect(204);
      await http()
        .get('/api/v1/me')
        .set('Authorization', `Bearer ${body.tokens.accessToken}`)
        .expect(401);
      await http()
        .get('/api/v1/me')
        .set('Authorization', `Bearer ${other.tokens.accessToken}`)
        .expect(200);
    });
  });

  describe('one-time codes', () => {
    it('signs in by phone, creating the account once, and codes are single-use', async () => {
      const phone = uniquePhone();
      const challenge = await otpLogin(phone.local);
      expect(challenge.destinationHint).toBe(`+58 *** ***${phone.e164.slice(-4)}`);

      const wrong = await http()
        .post('/api/v1/auth/otp/verify')
        .send({ challengeId: challenge.challengeId, code: '000000', client: 'passenger' });
      // 1-in-a-million chance the random code is 000000.
      if (otp.codeFor(phone.e164) !== '000000') {
        expect(wrong.status).toBe(400);
        expect(wrong.body.error.code).toBe('OTP_INVALID');
      }

      const code = otp.codeFor(phone.e164);
      const first = (
        await http()
          .post('/api/v1/auth/otp/verify')
          .send({ challengeId: challenge.challengeId, code, client: 'passenger' })
          .expect(200)
      ).body as AuthResponse;
      expect(first.user).toMatchObject({ phone: phone.e164, phoneVerified: true, email: null });

      const reused = await http()
        .post('/api/v1/auth/otp/verify')
        .send({ challengeId: challenge.challengeId, code, client: 'passenger' })
        .expect(400);
      expect(reused.body.error.code).toBe('OTP_INVALID');

      const again = await otpLogin(phone.e164);
      const second = (
        await http()
          .post('/api/v1/auth/otp/verify')
          .send({
            challengeId: again.challengeId,
            code: otp.codeFor(phone.e164),
            client: 'transport',
          })
          .expect(200)
      ).body as AuthResponse;
      expect(second.user.id).toBe(first.user.id);
    });

    it('signs in by e-mail code', async () => {
      const email = uniqueEmail();
      const challenge = await otpLogin(email, 'email');
      const res = await http()
        .post('/api/v1/auth/otp/verify')
        .send({ challengeId: challenge.challengeId, code: otp.codeFor(email), client: 'web' })
        .expect(200);
      expect(res.body.user).toMatchObject({ email, emailVerified: true });
    });

    it('locks a challenge after too many wrong attempts', async () => {
      const phone = uniquePhone();
      const challenge = await otpLogin(phone.local);
      const code = otp.codeFor(phone.e164);
      const wrongCode = code === '111111' ? '222222' : '111111';
      for (let i = 0; i < 5; i++) {
        await http()
          .post('/api/v1/auth/otp/verify')
          .send({ challengeId: challenge.challengeId, code: wrongCode, client: 'passenger' })
          .expect(400);
      }
      const locked = await http()
        .post('/api/v1/auth/otp/verify')
        .send({ challengeId: challenge.challengeId, code, client: 'passenger' })
        .expect(400);
      expect(locked.body.error.code).toBe('OTP_EXPIRED');
    });

    it('enforces the attempt limit under parallel guesses', async () => {
      const phone = uniquePhone();
      const challenge = await otpLogin(phone.local);
      const code = otp.codeFor(phone.e164);
      const wrongCode = code === '333333' ? '444444' : '333333';
      const results = await Promise.all(
        Array.from({ length: 10 }, () =>
          http()
            .post('/api/v1/auth/otp/verify')
            .send({ challengeId: challenge.challengeId, code: wrongCode, client: 'passenger' }),
        ),
      );
      const codes = results.map((r) => r.body.error.code);
      expect(codes.filter((c) => c === 'OTP_INVALID')).toHaveLength(5);
      expect(codes.filter((c) => c === 'OTP_EXPIRED')).toHaveLength(5);
      // Even the right code is refused once the limit is reached.
      const res = await http()
        .post('/api/v1/auth/otp/verify')
        .send({ challengeId: challenge.challengeId, code, client: 'passenger' })
        .expect(400);
      expect(res.body.error.code).toBe('OTP_EXPIRED');
    });

    it('rejects invalid destinations', async () => {
      const res = await http()
        .post('/api/v1/auth/otp/request')
        .send({ channel: 'sms', destination: '123' })
        .expect(400);
      expect(res.body.error.code).toBe('VALIDATION_FAILED');
    });
  });

  describe('contact verification', () => {
    it('adds a verified phone to an e-mail account and refuses a phone owned by someone else', async () => {
      const { body } = await register();
      const auth = `Bearer ${body.tokens.accessToken}`;
      const phone = uniquePhone();

      const challenge = (
        await http()
          .post('/api/v1/me/contact-verification/request')
          .set('Authorization', auth)
          .send({ channel: 'whatsapp', destination: phone.local })
          .expect(202)
      ).body as OtpChallengeResponse;
      const verified = await http()
        .post('/api/v1/me/contact-verification/confirm')
        .set('Authorization', auth)
        .send({ challengeId: challenge.challengeId, code: otp.codeFor(phone.e164) })
        .expect(200);
      expect(verified.body).toMatchObject({ phone: phone.e164, phoneVerified: true });

      // A second account cannot claim the same phone.
      const other = await register();
      const otherAuth = `Bearer ${other.body.tokens.accessToken}`;
      const second = (
        await http()
          .post('/api/v1/me/contact-verification/request')
          .set('Authorization', otherAuth)
          .send({ channel: 'sms', destination: phone.e164 })
          .expect(202)
      ).body as OtpChallengeResponse;
      const conflict = await http()
        .post('/api/v1/me/contact-verification/confirm')
        .set('Authorization', otherAuth)
        .send({ challengeId: second.challengeId, code: otp.codeFor(phone.e164) })
        .expect(409);
      expect(conflict.body.error.code).toBe('CONFLICT');
    });

    it('does not accept a login code as a verification code', async () => {
      const { body } = await register();
      const phone = uniquePhone();
      const challenge = await otpLogin(phone.local);
      const res = await http()
        .post('/api/v1/me/contact-verification/confirm')
        .set('Authorization', `Bearer ${body.tokens.accessToken}`)
        .send({ challengeId: challenge.challengeId, code: otp.codeFor(phone.e164) })
        .expect(400);
      expect(res.body.error.code).toBe('OTP_INVALID');
    });
  });
});
