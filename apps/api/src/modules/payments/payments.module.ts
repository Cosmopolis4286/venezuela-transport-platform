import { Module } from '@nestjs/common';
import { AppConfigService } from '../../config/app-config.service.js';
import { AuditModule } from '../audit/audit.module.js';
import { BookingsModule } from '../bookings/bookings.module.js';
import { IdentityModule } from '../identity/identity.module.js';
import { OrganizationsModule } from '../organizations/organizations.module.js';
import { PAYMENT_PROVIDERS, SimulatedPaymentProvider } from './payment-provider.js';
import { ExchangeRatesController, MyPaymentsController } from './payments.controller.js';
import { PaymentsService } from './payments.service.js';

/** Exchange rates, payments through provider adapters (ADR-018) and booking confirmation. */
@Module({
  imports: [IdentityModule, AuditModule, OrganizationsModule, BookingsModule],
  controllers: [MyPaymentsController, ExchangeRatesController],
  providers: [
    PaymentsService,
    {
      provide: PAYMENT_PROVIDERS,
      inject: [AppConfigService],
      // Real adapters are added here as they are contracted, each with its own configuration.
      useFactory: (config: AppConfigService) =>
        config.get('PAYMENT_PROVIDER') === 'simulated' ? [new SimulatedPaymentProvider()] : [],
    },
  ],
  exports: [PaymentsService],
})
export class PaymentsModule {}
