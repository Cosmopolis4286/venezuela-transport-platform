import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import { AppConfigModule } from './config/config.module.js';
import { AppConfigService } from './config/app-config.service.js';
import { buildLoggerParams } from './config/logger.config.js';
import { DatabaseModule } from './database/database.module.js';
import { BookingsModule } from './modules/bookings/bookings.module.js';
import { DispatchModule } from './modules/dispatch/dispatch.module.js';
import { FleetModule } from './modules/fleet/fleet.module.js';
import { HealthModule } from './modules/health/health.module.js';
import { IdentityModule } from './modules/identity/identity.module.js';
import { NetworkModule } from './modules/network/network.module.js';
import { OnboardingModule } from './modules/onboarding/onboarding.module.js';
import { OrganizationsModule } from './modules/organizations/organizations.module.js';
import { PaymentsModule } from './modules/payments/payments.module.js';
import { SettlementsModule } from './modules/settlements/settlements.module.js';
import { TaxiModule } from './modules/taxi/taxi.module.js';
import { StorageModule } from './storage/storage.module.js';

@Module({
  imports: [
    AppConfigModule,
    LoggerModule.forRootAsync({
      inject: [AppConfigService],
      useFactory: (config: AppConfigService) =>
        buildLoggerParams({ LOG_LEVEL: config.get('LOG_LEVEL'), NODE_ENV: config.get('NODE_ENV') }),
    }),
    // In-memory store: correct for a single API instance. Switch to a Redis storage
    // adapter before running more than one instance.
    ThrottlerModule.forRootAsync({
      inject: [AppConfigService],
      useFactory: (config: AppConfigService) => [
        { ttl: config.get('RATE_LIMIT_TTL_SECONDS') * 1000, limit: config.get('RATE_LIMIT_MAX') },
      ],
    }),
    DatabaseModule,
    StorageModule,
    // Feature modules (see docs/architecture/overview.md) are registered below.
    HealthModule,
    IdentityModule,
    OrganizationsModule,
    OnboardingModule,
    FleetModule,
    NetworkModule,
    BookingsModule,
    PaymentsModule,
    SettlementsModule,
    DispatchModule,
    TaxiModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
