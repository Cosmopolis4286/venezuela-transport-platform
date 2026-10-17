import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { isApiErrorResponse } from '@vtp/shared-types';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';

// Runs against the real database from apps/api/.env (or the CI service container).
// The readiness assertion is skipped when E2E_EXPECT_DATABASE is not "true".
const expectDatabase = process.env.E2E_EXPECT_DATABASE === 'true';

describe('API (e2e)', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>();
    configureApp(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /api/v1/health reports liveness', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/health').expect(200);
    expect(res.body).toMatchObject({ status: 'ok', service: 'vtp-api' });
    expect(res.headers['x-request-id']).toBeTruthy();
  });

  it.runIf(expectDatabase)(
    'GET /api/v1/health/ready reports the database as reachable',
    async () => {
      const res = await request(app.getHttpServer()).get('/api/v1/health/ready').expect(200);
      expect(res.body).toMatchObject({ status: 'ok', checks: { database: { status: 'ok' } } });
    },
  );

  it('sends security headers and hides the framework', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/health').expect(200);
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['strict-transport-security']).toBeDefined();
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it('never rate limits health probes', async () => {
    for (let i = 0; i < 5; i++) {
      await request(app.getHttpServer()).get('/api/v1/health').expect(200);
    }
  });

  it('unknown routes return the shared error shape', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/does-not-exist').expect(404);
    expect(isApiErrorResponse(res.body)).toBe(true);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('unversioned paths are not served', async () => {
    await request(app.getHttpServer()).get('/health').expect(404);
  });
});
