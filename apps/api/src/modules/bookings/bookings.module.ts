import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module.js';
import { IdentityModule } from '../identity/identity.module.js';
import { NetworkModule } from '../network/network.module.js';
import { OrganizationsModule } from '../organizations/organizations.module.js';
import { BookingsController, OrganizationTripsController } from './bookings.controller.js';
import { BookingsService } from './bookings.service.js';
import { TripsService } from './trips.service.js';

/** Trips (one schedule on one date), seat holds and the operators' passenger lists. */
@Module({
  imports: [IdentityModule, AuditModule, OrganizationsModule, NetworkModule],
  controllers: [BookingsController, OrganizationTripsController],
  providers: [TripsService, BookingsService],
  exports: [TripsService, BookingsService],
})
export class BookingsModule {}
