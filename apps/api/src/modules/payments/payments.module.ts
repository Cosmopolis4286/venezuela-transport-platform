import { Module } from '@nestjs/common';
import { AppConfigService } from '../../config/app-config.service.js';
import { AuditModule } from '../audit/audit.module.js';
import { BookingsModule } from '../bookings/bookings.module.js';
import { IdentityModule } from '../identity/identity.module.js';
import { OrganizationsModule } from '../organizations/organizations.module.js';
import { DatabaseService } from '../../database/database.service.js';
import {
  ManualPaymentProvider,
  PAYMENT_PROVIDER,
  SimulatedPaymentProvider,
} from './payment-provider.js';
import {
  AdminPaymentsController,
  ExchangeRatesController,
  MyPaymentsController,
} from './payments.controller.js';
import { PaymentsService } from './payments.service.js';

/**
 * Exchange rates, payments through provider adapters (ADR-018) or verified by staff (ADR-027), and
 * booking confirmation.
 */
@Module({
  imports: [IdentityModule, AuditModule, OrganizationsModule, BookingsModule],
  controllers: [MyPaymentsController, ExchangeRatesController, AdminPaymentsController],
  providers: [
    PaymentsService,
    {
      provide: PAYMENT_PROVIDER,
      inject: [AppConfigService, DatabaseService],
      // Automatic adapters are added here as they are contracted, each with its own configuration.
      useFactory: (config: AppConfigService, database: DatabaseService) => {
        switch (config.get('PAYMENT_PROVIDER')) {
          case 'simulated':
            return new SimulatedPaymentProvider();
          case 'manual':
            return new ManualPaymentProvider(database);
          default:
            return null;
        }
      },
    },
  ],
  exports: [PaymentsService],
})
export class PaymentsModule {}
