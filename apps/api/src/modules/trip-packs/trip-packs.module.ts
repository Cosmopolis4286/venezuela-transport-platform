import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module.js';
import { IdentityModule } from '../identity/identity.module.js';
import { NetworkModule } from '../network/network.module.js';
import { AdminTripPacksController, TripPacksController } from './trip-packs.controller.js';
import { TripPacksService } from './trip-packs.service.js';

/**
 * Trip packs the platform sells (ADR-028): the catalog and the packs passengers buy. Payments
 * (`PaymentsModule`) activate them; bookings spend them.
 */
@Module({
  imports: [IdentityModule, AuditModule, NetworkModule],
  controllers: [TripPacksController, AdminTripPacksController],
  providers: [TripPacksService],
  exports: [TripPacksService],
})
export class TripPacksModule {}
