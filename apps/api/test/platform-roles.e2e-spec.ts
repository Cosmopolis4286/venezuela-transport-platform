import { randomUUID } from 'node:crypto';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import type { AuthResponse, PlatformRole, ProviderApplication } from '@vtp/shared-types';
import { eq } from 'drizzle-orm';
import request from 'supertest';
import { DatabaseService } from '../src/database/database.service.js';
import { users } from '../src/modules/identity/identity.schema.js';

const expectDatabase = process.env.E2E_EXPECT_DATABASE === 'true';

/** Each platform role reaches what its permissions allow, and nothing else (ADR: roles matrix). */
describe.runIf(expectDatabase)('Platform roles (e2e)', () => {
  let app: NestExpressApplication;
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    process.env.AUTH_RATE_LIMIT_MAX = '1000';
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

  const staff = async (role: PlatformRole | null) => {
    const res = (
      await http()
        .post('/api/v1/auth/register')
        .send({
          email: `platform-${role ?? 'none'}-${randomUUID()}@example.com`,
          password: 'una frase larga de prueba',
          firstName: 'Equipo',
          lastName: 'Prueba',
          client: 'web',
          acceptTerms: true,
        })
        .expect(201)
    ).body as AuthResponse;
    await app
      .get(DatabaseService)
      .db.update(users)
      .set({ platformRole: role })
      .where(eq(users.id, res.user.id));
    return `Bearer ${res.tokens.accessToken}`;
  };

  /** [method, path, body?] → the status each role gets (403 = the guard said no). */
  const routes: [string, string, number, number, number, number, number][] = [
    // method+path                                   admin reviewer finance support none
    ['GET', '/admin/organizations', 200, 200, 200, 200, 403],
    ['GET', '/admin/applications', 200, 200, 403, 200, 403],
    ['GET', '/admin/stops', 200, 200, 200, 200, 403],
    ['GET', '/admin/zones', 200, 200, 200, 200, 403],
    ['GET', '/admin/bookings/by-code/VTP-ZZZZZZ', 404, 404, 404, 404, 403],
    ['GET', '/admin/taxi-rides', 200, 200, 403, 200, 403],
    ['GET', '/admin/payments/review', 200, 403, 200, 403, 403],
    ['GET', '/admin/settlements', 200, 403, 200, 403, 403],
    ['GET', '/admin/refunds', 200, 403, 200, 403, 403],
    ['GET', '/admin/fiscal/settings', 200, 403, 200, 403, 403],
    ['GET', '/admin/exchange-rates', 200, 403, 200, 403, 403],
    ['GET', '/admin/metrics', 200, 403, 200, 403, 403],
    ['GET', '/admin/trip-pack-products', 200, 403, 403, 403, 403],
    ['GET', '/admin/independent-lines', 200, 403, 403, 403, 403],
  ];

  it('opens each admin route only to the platform roles whose permissions include it', async () => {
    const roles: (PlatformRole | null)[] = ['admin', 'reviewer', 'finance', 'support', null];
    const auth = await Promise.all(roles.map(staff));
    const mismatches: string[] = [];
    for (const [method, path, ...expected] of routes) {
      for (const [i, role] of roles.entries()) {
        const res = await http()
          [method.toLowerCase() as 'get'](`/api/v1${path}`)
          .set('Authorization', auth[i]!);
        if (res.status !== expected[i]) {
          mismatches.push(`${role ?? 'none'} ${method} ${path}: ${res.status} ≠ ${expected[i]}`);
        }
      }
    }
    expect(mismatches).toEqual([]);

    // Writes are narrower than reads: support and finance see stops but cannot add them.
    const [, reviewer, finance, support] = auth;
    const stop = { kind: 'stop', name: `Parada ${randomUUID()}`, city: 'Caracas', state: 'DC' };
    for (const who of [finance, support]) {
      await http().post('/api/v1/admin/stops').set('Authorization', who!).send(stop).expect(403);
    }
    await http().post('/api/v1/admin/stops').set('Authorization', reviewer!).send(stop).expect(201);
    // Only reviewers (and admins) decide on organizations.
    for (const who of [finance, support]) {
      await http()
        .post(`/api/v1/admin/organizations/${randomUUID()}/review`)
        .set('Authorization', who!)
        .send({ decision: 'approve' })
        .expect(403);
    }
  });

  it('shows support the KYC queue without ID numbers, and keeps the details for reviewers', async () => {
    const applicant = await staff(null);
    const created = (
      await http()
        .post('/api/v1/me/application')
        .set('Authorization', applicant)
        .send({
          desiredRole: 'driver',
          firstName: 'Luis',
          lastName: 'Aspirante',
          documentType: 'V',
          documentNumber: 'V-18765432',
          birthDate: '1991-02-03',
          providesVehicle: false,
        })
        .expect(201)
    ).body as ProviderApplication;
    const [reviewer, support] = [await staff('reviewer'), await staff('support')];
    const queue = async (auth: string) =>
      (
        (await http().get('/api/v1/admin/applications?status=draft').set('Authorization', auth))
          .body as ProviderApplication[]
      ).find((a) => a.id === created.id);

    expect(await queue(reviewer)).toMatchObject({
      documentNumber: '18765432',
      birthDate: '1991-02-03',
    });
    expect(await queue(support)).toMatchObject({
      firstName: 'Luis',
      documentNumber: '',
      birthDate: '',
    });
    await http()
      .get(`/api/v1/admin/applications/${created.id}`)
      .set('Authorization', support)
      .expect(403);
    await http()
      .get(`/api/v1/admin/applications/${created.id}`)
      .set('Authorization', reviewer)
      .expect(200);
  });
});
