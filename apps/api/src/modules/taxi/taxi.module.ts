import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module.js';
import { FleetModule } from '../fleet/fleet.module.js';
import { IdentityModule } from '../identity/identity.module.js';
import { NetworkModule } from '../network/network.module.js';
import { OrganizationsModule } from '../organizations/organizations.module.js';
import { TripPacksModule } from '../trip-packs/trip-packs.module.js';
import {
  AdminDriverQualityController,
  AdminSafetyController,
  AdminTaxiController,
  TaxiController,
  TaxiDriverController,
  TaxiLineController,
  TaxiSharedController,
  TaxiTrackingController,
} from './taxi.controller.js';
import { DriverQualityService } from './driver-quality.service.js';
import { TaxiService } from './taxi.service.js';

/** Taxis to and from the terminals: requests, taking them, and the ride's lifecycle. */
@Module({
  imports: [
    IdentityModule,
    AuditModule,
    OrganizationsModule,
    NetworkModule,
    FleetModule,
    TripPacksModule,
  ],
  controllers: [
    TaxiController,
    TaxiDriverController,
    TaxiLineController,
    AdminTaxiController,
    TaxiTrackingController,
    TaxiSharedController,
    AdminSafetyController,
    AdminDriverQualityController,
  ],
  providers: [TaxiService, DriverQualityService],
  exports: [TaxiService],
})
export class TaxiModule {}
