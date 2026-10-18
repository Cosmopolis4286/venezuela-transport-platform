import { Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { OrganizationMembershipSummary, ReceivedInvitation } from '@vtp/shared-types';
import { CurrentAuth, ReqMeta } from '../identity/auth.decorators.js';
import type { Authenticated, RequestMeta } from '../identity/sessions.service.js';
import { InvitationsService } from './invitations.service.js';
import { OrganizationsService } from './organizations.service.js';

@ApiTags('me')
@ApiBearerAuth()
@Controller({ path: 'me', version: '1' })
export class MeOrganizationsController {
  constructor(
    private readonly organizations: OrganizationsService,
    private readonly invitations: InvitationsService,
  ) {}

  /** Organizations the user belongs to, with their role and permissions in each. */
  @Get('organizations')
  organizationsOfUser(
    @CurrentAuth() auth: Authenticated,
  ): Promise<OrganizationMembershipSummary[]> {
    return this.organizations.listForUser(auth.user.id);
  }

  /** Pending invitations sent to the user's verified e-mail or phone. */
  @Get('invitations')
  invitationsOfUser(@CurrentAuth() auth: Authenticated): Promise<ReceivedInvitation[]> {
    return this.invitations.listReceived(auth.user);
  }

  @Post('invitations/:invitationId/accept')
  @HttpCode(HttpStatus.NO_CONTENT)
  accept(
    @CurrentAuth() auth: Authenticated,
    @Param('invitationId', ParseUUIDPipe) invitationId: string,
    @ReqMeta() meta: RequestMeta,
  ): Promise<void> {
    return this.invitations.respond(auth, invitationId, 'accept', meta);
  }

  @Post('invitations/:invitationId/decline')
  @HttpCode(HttpStatus.NO_CONTENT)
  decline(
    @CurrentAuth() auth: Authenticated,
    @Param('invitationId', ParseUUIDPipe) invitationId: string,
    @ReqMeta() meta: RequestMeta,
  ): Promise<void> {
    return this.invitations.respond(auth, invitationId, 'decline', meta);
  }
}
