import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module.js';
import { IdentityModule } from '../identity/identity.module.js';
import { OrganizationsModule } from '../organizations/organizations.module.js';
import { FleetController } from './fleet.controller.js';
import { FleetService } from './fleet.service.js';
import { VehiclesController } from './vehicles.controller.js';
import { VehiclesService } from './vehicles.service.js';

/** Seat layouts and the vehicles operators run. */
@Module({
  imports: [IdentityModule, AuditModule, OrganizationsModule],
  controllers: [FleetController, VehiclesController],
  providers: [FleetService, VehiclesService],
  exports: [FleetService, VehiclesService],
})
export class FleetModule {}
