import type { AppConfigService } from '../../config/app-config.service.js';
import type { DatabaseService } from '../../database/database.service.js';
import { HealthService } from './health.service.js';

const config = { get: () => '1.2.3' } as unknown as AppConfigService;

describe('HealthService', () => {
  it('reports liveness without touching dependencies', () => {
    const service = new HealthService({} as DatabaseService, config);
    expect(service.liveness()).toMatchObject({
      status: 'ok',
      service: 'vtp-api',
      version: '1.2.3',
    });
  });

  it('is ready when the database answers', async () => {
    const service = new HealthService(
      { ping: async () => 3 } as unknown as DatabaseService,
      config,
    );
    await expect(service.readiness()).resolves.toMatchObject({
      status: 'ok',
      checks: { database: { status: 'ok', latencyMs: 3 } },
    });
  });

  it('is not ready when the database is unreachable', async () => {
    const service = new HealthService(
      {
        ping: async () => {
          throw new Error('connect ECONNREFUSED');
        },
      } as unknown as DatabaseService,
      config,
    );
    await expect(service.readiness()).resolves.toMatchObject({
      status: 'down',
      checks: { database: { status: 'down' } },
    });
  });
});
