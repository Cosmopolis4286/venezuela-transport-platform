import { Injectable, Logger, type OnApplicationShutdown } from '@nestjs/common';
import pg from 'pg';
import { AppConfigService } from '../config/app-config.service.js';

/**
 * Owns the PostgreSQL connection pool. The pool connects lazily, so the API can
 * boot (and report itself as not ready) while the database is still starting.
 *
 * This is deliberately thin: no ORM is chosen yet (see docs/architecture/decisions.md).
 */
@Injectable()
export class DatabaseService implements OnApplicationShutdown {
  private readonly logger = new Logger(DatabaseService.name);
  readonly pool: pg.Pool;

  constructor(config: AppConfigService) {
    this.pool = new pg.Pool({
      host: config.get('DATABASE_HOST'),
      port: config.get('DATABASE_PORT'),
      database: config.get('DATABASE_NAME'),
      user: config.get('DATABASE_USER'),
      password: config.get('DATABASE_PASSWORD'),
      ssl: config.get('DATABASE_SSL') ? { rejectUnauthorized: true } : false,
      max: config.get('DATABASE_POOL_MAX'),
      connectionTimeoutMillis: 3_000,
      idleTimeoutMillis: 30_000,
      application_name: 'vtp-api',
    });
    // Without a listener, an error on an idle client would crash the process.
    this.pool.on('error', (error) =>
      this.logger.error(`Idle database client error: ${error.message}`),
    );
  }

  /** Round-trips a trivial query. Resolves with latency in ms or rejects. */
  async ping(): Promise<number> {
    const started = performance.now();
    await this.pool.query('SELECT 1');
    return Math.round(performance.now() - started);
  }

  async onApplicationShutdown(signal?: string): Promise<void> {
    await this.pool.end();
    this.logger.log(`Database pool closed${signal ? ` (${signal})` : ''}`);
  }
}
