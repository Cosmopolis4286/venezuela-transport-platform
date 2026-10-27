import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module.js';
import { IdentityModule } from '../identity/identity.module.js';
import { NetworkModule } from '../network/network.module.js';
import { OrganizationsModule } from '../organizations/organizations.module.js';
import {
  BookingsController,
  OrganizationTicketsController,
  OrganizationTripsController,
} from './bookings.controller.js';
import { BookingsService } from './bookings.service.js';
import { TicketsService } from './tickets.service.js';
import { TripsService } from './trips.service.js';

/** Trips (one schedule on one date), seat holds, passenger lists and ticket validation. */
@Module({
  imports: [IdentityModule, AuditModule, OrganizationsModule, NetworkModule],
  controllers: [BookingsController, OrganizationTripsController, OrganizationTicketsController],
  providers: [TripsService, BookingsService, TicketsService],
  exports: [TripsService, BookingsService],
})
export class BookingsModule {}
