import { randomUUID } from 'node:crypto';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import {
  todayInVenezuela,
  type AuthResponse,
  type BcvRate,
  type BcvSyncResult,
} from '@vtp/shared-types';
import { eq } from 'drizzle-orm';
import request from 'supertest';
import { DatabaseService } from '../src/database/database.service.js';
import { BcvRatesService } from '../src/modules/bcv-rates/bcv-rates.service.js';
import type { BcvRateFetcher, FetchedRate } from '../src/modules/bcv-rates/bcv-sources.js';
import { users } from '../src/modules/identity/identity.schema.js';
import { OFFICIAL_RATE, setOfficialRate } from './support/official-rate.js';

const expectDatabase = process.env.E2E_EXPECT_DATABASE === 'true';

/** A source whose next answer the test decides, without touching the network. */
class FakeFetcher implements BcvRateFetcher {
  next: FetchedRate | Error = new Error('not set');
  constructor(readonly source: 'bcv' | 'dolarapi') {}
  async fetch(): Promise<FetchedRate> {
    if (this.next instanceof Error) throw this.next;
    return this.next;
  }
}

const inDays = (days: number) =>
  new Date(Date.parse(`${todayInVenezuela()}T12:00:00Z`) + days * 86_400_000)
    .toISOString()
    .slice(0, 10);

/** The BCV's official rate, fetched by a job (ADR-048). */
describe.runIf(expectDatabase)('BCV official rate (e2e)', () => {
  let app: NestExpressApplication;
  const bcv = new FakeFetcher('bcv');
  const dolarApi = new FakeFetcher('dolarapi');
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    process.env.AUTH_RATE_LIMIT_MAX = '1000';
    process.env.RATE_LIMIT_MAX = '10000';
    const { AppModule } = await import('../src/app.module.js');
    const { configureApp } = await import('../src/app.setup.js');
    const { BCV_RATE_FETCHERS } = await import('../src/modules/bcv-rates/bcv-sources.js');
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(BCV_RATE_FETCHERS)
      .useValue([bcv, dolarApi])
      .compile();
    app = moduleRef.createNestApplication<NestExpressApplication>();
    configureApp(app);
    await app.init();
    await setOfficialRate(app);
  });

  afterAll(async () => {
    await app?.close();
  });

  it(
    'takes the rate from the BCV, or DolarApi when it fails, and never overwrites a typed one',
    { timeout: 30_000 },
    async () => {
      const service = app.get(BcvRatesService);
      // Every e2e file uses the same rate: the values here are always OFFICIAL_RATE.
      const rate = { unitsPerUsd: OFFICIAL_RATE };

      // The BCV publishes in the afternoon the rate of the next business day.
      bcv.next = { date: inDays(1), ...rate };
      let result = await service.sync();
      expect(result).toMatchObject({
        ok: true,
        errors: [],
        rate: { date: inDays(1), source: 'bcv' },
      });

      // The BCV's page fails: DolarApi answers.
      bcv.next = new Error('BCV page answered 503');
      dolarApi.next = { date: inDays(2), ...rate };
      result = await service.sync();
      expect(result).toMatchObject({
        ok: true,
        rate: { date: inDays(2), source: 'dolarapi' },
        errors: ['bcv: BCV page answered 503'],
      });

      // A rate typed by an admin stays as typed.
      bcv.next = { date: todayInVenezuela(), ...rate };
      result = await service.sync();
      expect(result.rate).toMatchObject({ date: todayInVenezuela(), source: 'manual' });

      // Both fail, or answer a date too far ahead: nothing is saved.
      bcv.next = new Error('timeout');
      dolarApi.next = new Error('DolarApi answered 500');
      expect(await service.sync()).toEqual({
        ok: false,
        rate: null,
        errors: ['bcv: timeout', 'dolarapi: DolarApi answered 500'],
      });
      bcv.next = { date: inDays(10), ...rate };
      expect((await service.sync()).errors[0]).toMatch(/too far ahead/);

      // The rate in force is today's, not tomorrow's; a week without a new one: none.
      expect(await service.current()).toMatchObject({ date: todayInVenezuela(), ...rate });
      expect(await service.current(new Date(Date.now() + 12 * 86_400_000))).toBeNull();

      // Public: the rate in force. Staff can fetch it now (finance.manage).
      expect(
        (
          (await http().get('/api/v1/exchange-rates/official').expect(200)).body as {
            rate: BcvRate;
          }
        ).rate,
      ).toMatchObject({ date: todayInVenezuela(), ...rate });
      await http().post('/api/v1/admin/fiscal/bcv-rates/sync').expect(401);
      const admin = (
        await http()
          .post('/api/v1/auth/register')
          .send({
            email: `bcv-admin-${randomUUID()}@example.test`,
            password: 'una frase larga de prueba',
            firstName: 'Admin',
            lastName: 'Prueba',
            client: 'web',
            acceptTerms: true,
          })
          .expect(201)
      ).body as AuthResponse;
      const auth = `Bearer ${admin.tokens.accessToken}`;
      await http()
        .post('/api/v1/admin/fiscal/bcv-rates/sync')
        .set('Authorization', auth)
        .expect(403);
      await app
        .get(DatabaseService)
        .db.update(users)
        .set({ platformRole: 'admin' })
        .where(eq(users.id, admin.user.id));
      bcv.next = { date: inDays(1), ...rate };
      const synced = (
        await http()
          .post('/api/v1/admin/fiscal/bcv-rates/sync')
          .set('Authorization', auth)
          .expect(200)
      ).body as BcvSyncResult;
      expect(synced).toMatchObject({ ok: true, rate: { source: 'bcv' } });
      const listed = (
        await http().get('/api/v1/admin/fiscal/bcv-rates').set('Authorization', auth).expect(200)
      ).body as BcvRate[];
      expect(listed.find((r) => r.date === inDays(1))).toMatchObject({ source: 'bcv' });
    },
  );
});
