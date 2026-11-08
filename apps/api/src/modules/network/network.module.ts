import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module.js';
import { FleetModule } from '../fleet/fleet.module.js';
import { IdentityModule } from '../identity/identity.module.js';
import { OrganizationsModule } from '../organizations/organizations.module.js';
import { RoutesController } from './routes.controller.js';
import { RoutesService } from './routes.service.js';
import { SearchController } from './search.controller.js';
import { SearchService } from './search.service.js';
import {
  AdminServiceAreasController,
  AdminServicesController,
  ServicesController,
} from './services.controller.js';
import { ServicesService } from './services.service.js';
import { AdminStopsController, StopsController } from './stops.controller.js';
import { StopsService } from './stops.service.js';

/**
 * The transport network: the stop catalog (platform staff), routes with fares and schedules
 * (bus companies and taxi lines) and the public departure search built on them.
 */
@Module({
  imports: [IdentityModule, AuditModule, OrganizationsModule, FleetModule],
  controllers: [
    StopsController,
    AdminStopsController,
    RoutesController,
    SearchController,
    ServicesController,
    AdminServicesController,
    AdminServiceAreasController,
  ],
  providers: [StopsService, RoutesService, SearchService, ServicesService],
  exports: [StopsService, ServicesService],
})
export class NetworkModule {}
