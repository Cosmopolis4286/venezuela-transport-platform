import { Controller, Get } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { isApiErrorResponse } from '@vtp/shared-types';
import request from 'supertest';

// Test-only route: no real throttled endpoint exists yet.
@Controller({ path: 'rate-limit-probe', version: '1' })
class ProbeController {
  @Get()
  get(): { ok: true } {
    return { ok: true };
  }
}

describe('Global rate limit (e2e)', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    // ConfigModule reads the environment when AppModule is first imported,
    // so set the limit before a dynamic import (static imports are hoisted).
    process.env.RATE_LIMIT_MAX = '3';
    const { AppModule } = await import('../src/app.module.js');
    const { configureApp } = await import('../src/app.setup.js');
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
      controllers: [ProbeController],
    }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>();
    configureApp(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    delete process.env.RATE_LIMIT_MAX;
  });

  it('returns 429 with the shared error shape once the limit is exceeded', async () => {
    for (let i = 0; i < 3; i++) {
      await request(app.getHttpServer()).get('/api/v1/rate-limit-probe').expect(200);
    }
    const res = await request(app.getHttpServer()).get('/api/v1/rate-limit-probe').expect(429);
    expect(isApiErrorResponse(res.body)).toBe(true);
    expect(res.body.error.code).toBe('RATE_LIMITED');
  });
});
