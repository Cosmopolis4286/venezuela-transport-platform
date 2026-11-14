import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module.js';
import { FleetModule } from '../fleet/fleet.module.js';
import { IdentityModule } from '../identity/identity.module.js';
import { NetworkModule } from '../network/network.module.js';
import { OrganizationsModule } from '../organizations/organizations.module.js';
import {
  AdminTaxiController,
  TaxiController,
  TaxiDriverController,
  TaxiLineController,
  TaxiTrackingController,
} from './taxi.controller.js';
import { TaxiService } from './taxi.service.js';

/**
 * Taxis and motorcycle taxis to, from and around the terminals: requests (from the app or, for
 * WhatsApp, by platform staff), taking them, the ride's lifecycle, tracking links and ratings.
 */
@Module({
  imports: [IdentityModule, AuditModule, OrganizationsModule, NetworkModule, FleetModule],
  controllers: [
    TaxiController,
    TaxiDriverController,
    TaxiLineController,
    AdminTaxiController,
    TaxiTrackingController,
  ],
  providers: [TaxiService],
})
export class TaxiModule {}
