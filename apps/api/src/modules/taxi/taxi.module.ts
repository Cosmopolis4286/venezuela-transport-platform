import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module.js';
import { FleetModule } from '../fleet/fleet.module.js';
import { IdentityModule } from '../identity/identity.module.js';
import { NetworkModule } from '../network/network.module.js';
import { OrganizationsModule } from '../organizations/organizations.module.js';
import { TaxiController, TaxiDriverController, TaxiLineController } from './taxi.controller.js';
import { TaxiService } from './taxi.service.js';

/** Taxis to and from the terminals: requests, taking them, and the ride's lifecycle. */
@Module({
  imports: [IdentityModule, AuditModule, OrganizationsModule, NetworkModule, FleetModule],
  controllers: [TaxiController, TaxiDriverController, TaxiLineController],
  providers: [TaxiService],
})
export class TaxiModule {}
