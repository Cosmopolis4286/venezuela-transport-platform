import { Module } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import { AppConfigModule } from './config/config.module.js';
import { AppConfigService } from './config/app-config.service.js';
import { buildLoggerParams } from './config/logger.config.js';
import { DatabaseModule } from './database/database.module.js';
import { HealthModule } from './modules/health/health.module.js';

@Module({
  imports: [
    AppConfigModule,
    LoggerModule.forRootAsync({
      inject: [AppConfigService],
      useFactory: (config: AppConfigService) =>
        buildLoggerParams({ LOG_LEVEL: config.get('LOG_LEVEL'), NODE_ENV: config.get('NODE_ENV') }),
    }),
    DatabaseModule,
    // Feature modules (see docs/architecture/overview.md) are registered below.
    HealthModule,
  ],
})
export class AppModule {}
