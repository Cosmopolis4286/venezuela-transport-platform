import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module.js';
import { OrganizationsModule } from '../organizations/organizations.module.js';
import { AdminMetricsController, OrganizationReportsController } from './reports.controller.js';
import { ReportsService } from './reports.service.js';

/** Read-only reports: operators' sales and occupancy, platform metrics. Owns no tables. */
@Module({
  imports: [IdentityModule, OrganizationsModule],
  controllers: [OrganizationReportsController, AdminMetricsController],
  providers: [ReportsService],
})
export class ReportsModule {}
