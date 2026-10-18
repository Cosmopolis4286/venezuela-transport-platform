import { Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { OrganizationApplicant } from '@vtp/shared-types';
import { CurrentAuth, ReqMeta } from '../identity/auth.decorators.js';
import type { Authenticated, RequestMeta } from '../identity/sessions.service.js';
import {
  CurrentOrganization,
  RequireOrganizationAccess,
  type OrganizationAccess,
} from '../organizations/organization-access.js';
import { OnboardingService } from './onboarding.service.js';

/** People approved by the platform who asked to join this organization. */
@ApiTags('organizations')
@ApiBearerAuth()
@Controller({ path: 'organizations/:organizationId/applicants', version: '1' })
export class OrganizationApplicantsController {
  constructor(private readonly onboarding: OnboardingService) {}

  @Get()
  @RequireOrganizationAccess('members.manage')
  list(@CurrentOrganization() access: OrganizationAccess): Promise<OrganizationApplicant[]> {
    return this.onboarding.applicantsFor(access.organization.id);
  }

  @Post(':applicationId/accept')
  @RequireOrganizationAccess('members.manage')
  @HttpCode(HttpStatus.NO_CONTENT)
  accept(
    @CurrentOrganization() access: OrganizationAccess,
    @Param('applicationId', ParseUUIDPipe) applicationId: string,
    @CurrentAuth() auth: Authenticated,
    @ReqMeta() meta: RequestMeta,
  ): Promise<void> {
    return this.onboarding.decide(access, applicationId, 'accept', auth, meta);
  }

  @Post(':applicationId/decline')
  @RequireOrganizationAccess('members.manage')
  @HttpCode(HttpStatus.NO_CONTENT)
  decline(
    @CurrentOrganization() access: OrganizationAccess,
    @Param('applicationId', ParseUUIDPipe) applicationId: string,
    @CurrentAuth() auth: Authenticated,
    @ReqMeta() meta: RequestMeta,
  ): Promise<void> {
    return this.onboarding.decide(access, applicationId, 'decline', auth, meta);
  }
}
