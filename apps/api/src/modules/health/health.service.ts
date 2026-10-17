import { Injectable, Logger } from '@nestjs/common';
import type { HealthResponse, ReadinessResponse } from '@vtp/shared-types';
import { AppConfigService } from '../../config/app-config.service.js';
import { DatabaseService } from '../../database/database.service.js';

const SERVICE_NAME = 'vtp-api';

@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name);

  constructor(
    private readonly database: DatabaseService,
    private readonly config: AppConfigService,
  ) {}

  liveness(): HealthResponse {
    return {
      status: 'ok',
      service: SERVICE_NAME,
      version: this.config.get('APP_VERSION'),
      uptime: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
    };
  }

  async readiness(): Promise<ReadinessResponse> {
    let database: ReadinessResponse['checks'][string];
    try {
      database = { status: 'ok', latencyMs: await this.database.ping() };
    } catch (error) {
      // Log the reason server-side; never return connection details to clients.
      this.logger.warn(`Database readiness check failed: ${(error as Error).message}`);
      database = { status: 'down' };
    }
    return {
      status: database.status === 'ok' ? 'ok' : 'down',
      checks: { database },
      timestamp: new Date().toISOString(),
    };
  }
}
