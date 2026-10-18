import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { AuthResponse, OtpChallengeResponse } from '@vtp/shared-types';
import { AuthThrottle, CurrentAuth, Public, ReqMeta } from './auth.decorators.js';
import { AuthService } from './auth.service.js';
import {
  OtpRequestDto,
  OtpVerifyDto,
  PasswordLoginDto,
  RefreshDto,
  RegisterDto,
} from './dto/auth.dto.js';
import type { Authenticated, RequestMeta } from './sessions.service.js';

@ApiTags('auth')
@Controller({ path: 'auth', version: '1' })
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  /** E-mail + password sign-up (passengers). */
  @Public()
  @AuthThrottle()
  @Post('register')
  register(@Body() body: RegisterDto, @ReqMeta() meta: RequestMeta): Promise<AuthResponse> {
    return this.auth.register(body, meta);
  }

  @Public()
  @AuthThrottle()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  login(@Body() body: PasswordLoginDto, @ReqMeta() meta: RequestMeta): Promise<AuthResponse> {
    return this.auth.loginWithPassword(body, meta);
  }

  /** Sends a 6-digit code by SMS, WhatsApp or e-mail. */
  @Public()
  @AuthThrottle()
  @Post('otp/request')
  @HttpCode(HttpStatus.ACCEPTED)
  requestOtp(
    @Body() body: OtpRequestDto,
    @ReqMeta() meta: RequestMeta,
  ): Promise<OtpChallengeResponse> {
    return this.auth.requestLoginOtp(body, meta);
  }

  /** Signs in with the code; creates the account on first use. */
  @Public()
  @AuthThrottle()
  @Post('otp/verify')
  @HttpCode(HttpStatus.OK)
  verifyOtp(@Body() body: OtpVerifyDto, @ReqMeta() meta: RequestMeta): Promise<AuthResponse> {
    return this.auth.verifyLoginOtp(body, meta);
  }

  @Public()
  @AuthThrottle()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  refresh(@Body() body: RefreshDto, @ReqMeta() meta: RequestMeta): Promise<AuthResponse> {
    return this.auth.refresh(body.refreshToken, meta);
  }

  @ApiBearerAuth()
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(@CurrentAuth() auth: Authenticated, @ReqMeta() meta: RequestMeta): Promise<void> {
    await this.auth.logout(auth, meta);
  }
}
