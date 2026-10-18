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
import type { Organization } from '@vtp/shared-types';
import { CurrentAuth, ReqMeta } from '../identity/auth.decorators.js';
import { RequirePlatformRole } from '../identity/platform-role.guard.js';
import type { Authenticated, RequestMeta } from '../identity/sessions.service.js';
import { OrganizationStatusQueryDto, ReviewOrganizationDto } from './organizations.dto.js';
import { OrganizationsService } from './organizations.service.js';

/** Platform staff: review queue for newly registered organizations. */
@ApiTags('admin')
@ApiBearerAuth()
@RequirePlatformRole('reviewer')
@Controller({ path: 'admin/organizations', version: '1' })
export class AdminOrganizationsController {
  constructor(private readonly organizations: OrganizationsService) {}

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
