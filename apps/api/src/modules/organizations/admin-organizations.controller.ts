import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type {
  IndependentLine,
  Organization,
  OrganizationMembershipSummary,
} from '@vtp/shared-types';
import { CurrentAuth, ReqMeta } from '../identity/auth.decorators.js';
import { RequirePlatformPermission } from '../identity/platform-role.guard.js';
import type { Authenticated, RequestMeta } from '../identity/sessions.service.js';
import {
  CreateIndependentLineDto,
  OrganizationStatusQueryDto,
  ReviewOrganizationDto,
} from './organizations.dto.js';
import { OrganizationsService } from './organizations.service.js';

/** Platform staff: review queue for newly registered organizations. */
@ApiTags('admin')
@ApiBearerAuth()
@RequirePlatformPermission('organizations.review')
@Controller({ path: 'admin/organizations', version: '1' })
export class AdminOrganizationsController {
  constructor(private readonly organizations: OrganizationsService) {}

  @RequirePlatformPermission('organizations.view')
  @Get()
  list(@Query() query: OrganizationStatusQueryDto): Promise<Organization[]> {
    return this.organizations.listByStatus(query.status ?? 'pending_review');
  }

  @Post(':organizationId/review')
  @HttpCode(HttpStatus.OK)
  review(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Body() body: ReviewOrganizationDto,
    @CurrentAuth() auth: Authenticated,
    @ReqMeta() meta: RequestMeta,
  ): Promise<Organization> {
    return this.organizations.review(organizationId, body, auth, meta);
  }
}

/** Platform admins: the lines the platform runs for independent drivers (ADR-039). */
@ApiTags('admin')
@ApiBearerAuth()
@RequirePlatformPermission('independents.manage')
@Controller({ path: 'admin/independent-lines', version: '1' })
export class AdminIndependentLinesController {
  constructor(private readonly organizations: OrganizationsService) {}

  @Get()
  list(): Promise<IndependentLine[]> {
    return this.organizations.independentLines();
  }

  @Post()
  create(
    @Body() body: CreateIndependentLineDto,
    @CurrentAuth() auth: Authenticated,
    @ReqMeta() meta: RequestMeta,
  ): Promise<OrganizationMembershipSummary> {
    return this.organizations.createIndependentLine(auth, body, meta);
  }
}
