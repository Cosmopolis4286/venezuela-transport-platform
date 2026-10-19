import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module.js';
import { IdentityModule } from '../identity/identity.module.js';
import { OrganizationsModule } from '../organizations/organizations.module.js';
import { FleetController } from './fleet.controller.js';
import { FleetService } from './fleet.service.js';

/** Seat layouts of the vehicles operators run (vehicles themselves come with dispatch). */
@Module({
  imports: [IdentityModule, AuditModule, OrganizationsModule],
  controllers: [FleetController],
  providers: [FleetService],
  exports: [FleetService],
})
export class FleetModule {}
