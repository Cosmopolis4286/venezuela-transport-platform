import { Body, Controller, Get, HttpCode, HttpStatus, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { OtpChallengeResponse, UserProfile } from '@vtp/shared-types';
import { AuditService } from '../audit/audit.service.js';
import { AuthThrottle, CurrentAuth, ReqMeta } from './auth.decorators.js';
import { AuthService } from './auth.service.js';
import { ContactVerificationConfirmDto, OtpRequestDto, UpdateProfileDto } from './dto/auth.dto.js';
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
  ) {}

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
