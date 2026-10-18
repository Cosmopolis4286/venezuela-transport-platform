import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type {
  Organization,
  OrganizationInvitation,
  OrganizationMember,
  OrganizationMembershipSummary,
} from '@vtp/shared-types';
import { CurrentAuth, ReqMeta } from '../identity/auth.decorators.js';
import type { Authenticated, RequestMeta } from '../identity/sessions.service.js';
import { InvitationsService } from './invitations.service.js';
import {
  CurrentOrganization,
  RequireOrganizationAccess,
  type OrganizationAccess,
} from './organization-access.js';
import {
  CreateInvitationDto,
  CreateOrganizationDto,
  UpdateMemberRoleDto,
  UpdateOrganizationDto,
} from './organizations.dto.js';
import { OrganizationsService } from './organizations.service.js';

@ApiTags('organizations')
@ApiBearerAuth()
@Controller({ path: 'organizations', version: '1' })
export class OrganizationsController {
  constructor(
    private readonly organizations: OrganizationsService,
    private readonly invitations: InvitationsService,
  ) {}

  /** Registers a bus company, taxi line or terminal. The caller becomes its owner. */
  @Post()
  create(
    @CurrentAuth() auth: Authenticated,
    @Body() body: CreateOrganizationDto,
    @ReqMeta() meta: RequestMeta,
  ): Promise<OrganizationMembershipSummary> {
    return this.organizations.create(auth, body, meta);
  }

  @Get(':organizationId')
  @RequireOrganizationAccess()
  get(@CurrentOrganization() access: OrganizationAccess): OrganizationMembershipSummary {
    return this.organizations.summary(access.organization, access.membership.role);
  }

  @Patch(':organizationId')
  @RequireOrganizationAccess('organization.manage')
  update(
    @CurrentOrganization() access: OrganizationAccess,
    @Body() body: UpdateOrganizationDto,
    @CurrentAuth() auth: Authenticated,
    @ReqMeta() meta: RequestMeta,
  ): Promise<Organization> {
    return this.organizations.update(access, body, auth, meta);
  }

  @Get(':organizationId/members')
  @RequireOrganizationAccess('members.view')
  members(@CurrentOrganization() access: OrganizationAccess): Promise<OrganizationMember[]> {
    return this.organizations.listMembers(access.organization.id);
  }

  @Patch(':organizationId/members/:userId')
  @RequireOrganizationAccess('members.manage')
  @HttpCode(HttpStatus.NO_CONTENT)
  changeRole(
    @CurrentOrganization() access: OrganizationAccess,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() body: UpdateMemberRoleDto,
    @CurrentAuth() auth: Authenticated,
    @ReqMeta() meta: RequestMeta,
  ): Promise<void> {
    return this.organizations.changeMemberRole(access, userId, body.role, auth, meta);
  }

  @Delete(':organizationId/members/:userId')
  @RequireOrganizationAccess('members.manage')
  @HttpCode(HttpStatus.NO_CONTENT)
  removeMember(
    @CurrentOrganization() access: OrganizationAccess,
    @Param('userId', ParseUUIDPipe) userId: string,
    @CurrentAuth() auth: Authenticated,
    @ReqMeta() meta: RequestMeta,
  ): Promise<void> {
    return this.organizations.removeMember(access, userId, auth, meta);
  }

  @Post(':organizationId/invitations')
  @RequireOrganizationAccess('members.manage')
  invite(
    @CurrentOrganization() access: OrganizationAccess,
    @Body() body: CreateInvitationDto,
    @CurrentAuth() auth: Authenticated,
    @ReqMeta() meta: RequestMeta,
  ): Promise<OrganizationInvitation> {
    return this.invitations.create(access, body, auth, meta);
  }

  @Get(':organizationId/invitations')
  @RequireOrganizationAccess('members.manage')
  listInvitations(
    @CurrentOrganization() access: OrganizationAccess,
  ): Promise<OrganizationInvitation[]> {
    return this.invitations.listForOrganization(access.organization.id);
  }

  @Delete(':organizationId/invitations/:invitationId')
  @RequireOrganizationAccess('members.manage')
  @HttpCode(HttpStatus.NO_CONTENT)
  revokeInvitation(
    @CurrentOrganization() access: OrganizationAccess,
    @Param('invitationId', ParseUUIDPipe) invitationId: string,
    @CurrentAuth() auth: Authenticated,
    @ReqMeta() meta: RequestMeta,
  ): Promise<void> {
    return this.invitations.revoke(access, invitationId, auth, meta);
  }
}
