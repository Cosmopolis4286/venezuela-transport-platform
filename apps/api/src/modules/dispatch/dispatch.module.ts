import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module.js';
import { BookingsModule } from '../bookings/bookings.module.js';
import { FleetModule } from '../fleet/fleet.module.js';
import { IdentityModule } from '../identity/identity.module.js';
import { NetworkModule } from '../network/network.module.js';
import { OrganizationsModule } from '../organizations/organizations.module.js';
import { DispatchController, DriverController } from './dispatch.controller.js';
import { DispatchService } from './dispatch.service.js';

/** Vehicle and driver assignment of trips, and the drivers' view of them. */
@Module({
  imports: [
    IdentityModule,
    AuditModule,
    OrganizationsModule,
    NetworkModule,
    FleetModule,
    BookingsModule,
  ],
  controllers: [DispatchController, DriverController],
  providers: [DispatchService],
})
export class DispatchModule {}
