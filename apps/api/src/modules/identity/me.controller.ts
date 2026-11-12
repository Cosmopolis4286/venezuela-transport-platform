import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { LEGAL_VERSION, type OtpChallengeResponse, type UserProfile } from '@vtp/shared-types';
import { ApiException } from '../../common/errors/api.exception.js';
import { AuditService } from '../audit/audit.service.js';
import { AuthThrottle, CurrentAuth, ReqMeta } from './auth.decorators.js';
import { AccountDeletionService } from './account-deletion.service.js';
import { AuthService } from './auth.service.js';
import { GuestService } from './guest.service.js';
import {
  AcceptTermsDto,
  ClaimGuestDto,
  ContactVerificationConfirmDto,
  OtpRequestDto,
  UpdateProfileDto,
  UpgradeGuestDto,
} from './dto/auth.dto.js';
import type { Authenticated, RequestMeta } from './sessions.service.js';
import { UsersService } from './users.service.js';

@ApiTags('me')
@ApiBearerAuth()
@Controller({ path: 'me', version: '1' })
export class MeController {
  constructor(
    private readonly users: UsersService,
    private readonly auth: AuthService,
    private readonly audit: AuditService,
    private readonly deletion: AccountDeletionService,
    private readonly guests: GuestService,
  ) {}

  /** A guest registers (e-mail and password) and keeps its trips (ADR-034). */
  @Post('account')
  @AuthThrottle()
  @HttpCode(HttpStatus.OK)
  upgradeGuest(
    @CurrentAuth() auth: Authenticated,
    @Body() body: UpgradeGuestDto,
    @ReqMeta() meta: RequestMeta,
  ): Promise<UserProfile> {
    return this.guests.upgrade(auth, body, meta);
  }

  /** After signing in on a phone that bought as a guest: its trips move to this account. */
  @Post('claim-guest')
  @AuthThrottle()
  @HttpCode(HttpStatus.OK)
  claimGuest(
    @CurrentAuth() auth: Authenticated,
    @Body() body: ClaimGuestDto,
    @ReqMeta() meta: RequestMeta,
  ): Promise<{ bookings: number }> {
    return this.guests.claim(auth, body.guestAccessToken, meta);
  }

  /** Accepts the current Terms and Privacy Policy (after a new version is published). */
  @Post('terms')
  @HttpCode(HttpStatus.OK)
  async acceptTerms(
    @CurrentAuth() auth: Authenticated,
    @Body() body: AcceptTermsDto,
    @ReqMeta() meta: RequestMeta,
  ): Promise<UserProfile> {
    if (body.version !== LEGAL_VERSION) {
      throw ApiException.conflict(
        `The current version is ${LEGAL_VERSION}; reload and accept it`,
        'RELOAD_AND_RETRY',
      );
    }
    const user = await this.users.acceptTerms(auth.user.id, LEGAL_VERSION);
    await this.audit.record({
      action: 'user.terms_accepted',
      actorUserId: user.id,
      ip: meta.ip,
      metadata: { version: LEGAL_VERSION },
    });
    return this.users.toProfile(user);
  }

  /**
   * Deletes the account: erases its personal data and signs it out everywhere. Refused while it
   * has upcoming paid trips, payments being checked or refunded, or is the only owner of an
   * organization.
   */
  @Delete()
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteAccount(@CurrentAuth() auth: Authenticated, @ReqMeta() meta: RequestMeta): Promise<void> {
    return this.deletion.delete(auth, meta);
  }

  @Get()
  me(@CurrentAuth() auth: Authenticated): UserProfile {
    return this.users.toProfile(auth.user);
  }

  @Patch()
  async update(
    @CurrentAuth() auth: Authenticated,
    @Body() body: UpdateProfileDto,
    @ReqMeta() meta: RequestMeta,
  ): Promise<UserProfile> {
    const user = await this.users.updateProfile(auth.user.id, {
      firstName: body.firstName?.trim(),
      lastName: body.lastName?.trim(),
    });
    await this.audit.record({ action: 'user.profile_updated', actorUserId: user.id, ip: meta.ip });
    return this.users.toProfile(user);
  }

  /** Sends a code to add or verify an e-mail/phone on the signed-in account. */
  @AuthThrottle()
  @Post('contact-verification/request')
  @HttpCode(HttpStatus.ACCEPTED)
  requestVerification(
    @CurrentAuth() auth: Authenticated,
    @Body() body: OtpRequestDto,
  ): Promise<OtpChallengeResponse> {
    return this.auth.requestContactVerification(auth, body);
  }

  @AuthThrottle()
  @Post('contact-verification/confirm')
  @HttpCode(HttpStatus.OK)
  confirmVerification(
    @CurrentAuth() auth: Authenticated,
    @Body() body: ContactVerificationConfirmDto,
    @ReqMeta() meta: RequestMeta,
  ): Promise<UserProfile> {
    return this.auth.confirmContactVerification(auth, body, meta);
  }
}
