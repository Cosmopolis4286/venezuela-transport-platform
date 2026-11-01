import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { OccupancyReport, PlatformMetrics, SalesReport } from '@vtp/shared-types';
import { RequirePlatformRole } from '../identity/platform-role.guard.js';
import {
  CurrentOrganization,
  RequireOrganizationAccess,
  type OrganizationAccess,
} from '../organizations/organization-access.js';
import { ReportRangeQueryDto } from './reports.dto.js';
import { reportRange, ReportsService } from './reports.service.js';

/** An operator's sales (money: `finance.view`) and occupancy (`bookings.view`). */
@ApiTags('reports')
@ApiBearerAuth()
@Controller({ path: 'organizations/:organizationId/reports', version: '1' })
export class OrganizationReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get('sales')
  @RequireOrganizationAccess('finance.view')
  sales(
    @CurrentOrganization() access: OrganizationAccess,
    @Query() query: ReportRangeQueryDto,
  ): Promise<SalesReport> {
    return this.reports.sales(access.organization.id, reportRange(query.from, query.to));
  }

  @Get('occupancy')
  @RequireOrganizationAccess('bookings.view')
  occupancy(
    @CurrentOrganization() access: OrganizationAccess,
    @Query() query: ReportRangeQueryDto,
  ): Promise<OccupancyReport> {
    return this.reports.occupancy(access.organization.id, reportRange(query.from, query.to));
  }
}

/** Platform admins: the whole platform in a range. */
@ApiTags('admin')
@ApiBearerAuth()
@RequirePlatformRole()
@Controller({ path: 'admin/metrics', version: '1' })
export class AdminMetricsController {
  constructor(private readonly reports: ReportsService) {}

  @Get()
  metrics(@Query() query: ReportRangeQueryDto): Promise<PlatformMetrics> {
    return this.reports.platform(reportRange(query.from, query.to));
  }
}
