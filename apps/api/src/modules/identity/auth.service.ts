import { randomUUID } from 'node:crypto';
import { HttpStatus, Injectable } from '@nestjs/common';
import {
  LEGAL_VERSION,
  type AuthClient,
  type AuthResponse,
  type OtpChallengeResponse,
  type OtpChannel,
  type UserProfile,
} from '@vtp/shared-types';
import { ApiException } from '../../common/errors/api.exception.js';
import { AppConfigService } from '../../config/app-config.service.js';
import { AuditService } from '../audit/audit.service.js';
import { contactKindFor, maskContact, normalizeContact, normalizeEmail } from './contact.js';
import { DUMMY_PASSWORD_HASH, hashPassword, verifyPassword } from './crypto/password-hasher.js';
import type { User } from './identity.schema.js';
import { OtpService } from './otp/otp.service.js';
import { SessionsService, type Authenticated, type RequestMeta } from './sessions.service.js';
import { UsersService } from './users.service.js';

@Injectable()
export class AuthService {
  constructor(
    private readonly users: UsersService,
    private readonly sessions: SessionsService,
    private readonly otp: OtpService,
    private readonly audit: AuditService,
    private readonly config: AppConfigService,
  ) {}

  async register(
    input: {
      email: string;
      password: string;
      firstName: string;
      lastName: string;
      client: AuthClient;
    },
    meta: RequestMeta,
  ): Promise<AuthResponse> {
    const email = this.requireEmail(input.email);
    const user = await this.users.createWithPassword({
      email,
      passwordHash: await hashPassword(input.password),
      firstName: input.firstName.trim(),
      lastName: input.lastName.trim(),
    });
    await this.audit.record({
      action: 'auth.register',
      actorUserId: user.id,
      ip: meta.ip,
      metadata: { termsVersion: LEGAL_VERSION },
    });
    return this.signIn(user, input.client, meta);
  }

  async loginWithPassword(
    input: { email: string; password: string; client: AuthClient },
    meta: RequestMeta,
  ): Promise<AuthResponse> {
    const email = normalizeEmail(input.email);
    const user = email ? await this.users.findByEmail(email) : undefined;
    // Always run the hash so response time does not reveal whether the e-mail exists.
    const valid = await verifyPassword(input.password, user?.passwordHash ?? DUMMY_PASSWORD_HASH);
    if (!user || !user.passwordHash || !valid) {
      await this.audit.record({
        action: 'auth.login.password_failed',
        actorUserId: user?.id ?? null,
        ip: meta.ip,
      });
      throw ApiException.invalidCredentials();
    }
    this.assertActive(user);
    await this.audit.record({ action: 'auth.login.password', actorUserId: user.id, ip: meta.ip });
    return this.signIn(user, input.client, meta);
  }

  async requestLoginOtp(
    input: { channel: OtpChannel; destination: string },
    meta: RequestMeta,
  ): Promise<OtpChallengeResponse> {
    const response = await this.issueOtp(input.channel, input.destination, 'login');
    await this.audit.record({
      action: 'auth.otp.requested',
      targetType: 'otp_challenge',
      targetId: response.challengeId,
      ip: meta.ip,
      metadata: { channel: input.channel },
    });
    return response;
  }

  async verifyLoginOtp(
    input: { challengeId: string; code: string; client: AuthClient; acceptTerms?: boolean },
    meta: RequestMeta,
  ): Promise<AuthResponse> {
    const challenge = await this.otp.verify(input.challengeId, input.code, 'login');
    let user = await this.users.findOrCreateByVerifiedContact(
      contactKindFor(challenge.channel),
      challenge.destination,
    );
    this.assertActive(user);
    if (input.acceptTerms && user.termsVersion !== LEGAL_VERSION) {
      user = await this.users.acceptTerms(user.id, LEGAL_VERSION);
      await this.audit.record({
        action: 'user.terms_accepted',
        actorUserId: user.id,
        ip: meta.ip,
        metadata: { version: LEGAL_VERSION },
      });
    }
    await this.audit.record({
      action: 'auth.login.otp',
      actorUserId: user.id,
      ip: meta.ip,
      metadata: { channel: challenge.channel },
    });
    return this.signIn(user, input.client, meta);
  }

  async requestContactVerification(
    auth: Authenticated,
    input: { channel: OtpChannel; destination: string },
  ): Promise<OtpChallengeResponse> {
    return this.issueOtp(input.channel, input.destination, 'verify_contact', auth.user.id);
  }

  async confirmContactVerification(
    auth: Authenticated,
    input: { challengeId: string; code: string },
    meta: RequestMeta,
  ): Promise<UserProfile> {
    const challenge = await this.otp.verify(input.challengeId, input.code, 'verify_contact');
    if (challenge.userId !== auth.user.id) {
      throw new ApiException('OTP_INVALID', 'The code is not valid', HttpStatus.BAD_REQUEST);
    }
    const user = await this.users.setVerifiedContact(
      auth.user.id,
      contactKindFor(challenge.channel),
      challenge.destination,
    );
    await this.audit.record({
      action: 'user.contact_verified',
      actorUserId: user.id,
      ip: meta.ip,
      metadata: { channel: challenge.channel },
    });
    return this.users.toProfile(user);
  }

  /**
   * E-mails a code to choose a new password. Unknown or suspended accounts get the same answer
   * without any e-mail, so the response never reveals who is registered.
   */
  async forgotPassword(rawEmail: string, meta: RequestMeta): Promise<OtpChallengeResponse> {
    const email = this.requireEmail(rawEmail);
    const user = await this.users.findByEmail(email);
    if (!user || user.status !== 'active') {
      await this.audit.record({ action: 'auth.password_reset.unknown', ip: meta.ip });
      const now = Date.now();
      return {
        challengeId: randomUUID(),
        channel: 'email',
        destinationHint: maskContact('email', email),
        expiresAt: new Date(now + this.config.get('OTP_TTL_MINUTES') * 60_000).toISOString(),
        resendAvailableAt: new Date(
          now + this.config.get('OTP_RESEND_SECONDS') * 1000,
        ).toISOString(),
      };
    }
    const response = await this.issueOtp('email', email, 'password_reset', user.id);
    await this.audit.record({
      action: 'auth.password_reset.requested',
      actorUserId: user.id,
      targetType: 'otp_challenge',
      targetId: response.challengeId,
      ip: meta.ip,
    });
    return response;
  }

  /** Sets the new password, signs out every session of the account and signs in here. */
  async resetPassword(
    input: { challengeId: string; code: string; password: string; client: AuthClient },
    meta: RequestMeta,
  ): Promise<AuthResponse> {
    const challenge = await this.otp.verify(input.challengeId, input.code, 'password_reset');
    const existing = challenge.userId ? await this.users.findById(challenge.userId) : undefined;
    if (!existing) {
      throw new ApiException('OTP_INVALID', 'The code is not valid', HttpStatus.BAD_REQUEST);
    }
    this.assertActive(existing);
    const user = await this.users.setPassword(existing.id, await hashPassword(input.password));
    await this.sessions.revokeAll(user.id, 'password_reset');
    await this.audit.record({ action: 'auth.password_reset', actorUserId: user.id, ip: meta.ip });
    return this.signIn(user, input.client, meta);
  }

  async refresh(refreshToken: string, meta: RequestMeta): Promise<AuthResponse> {
    const { user, tokens } = await this.sessions.refresh(refreshToken, meta);
    return { user: this.users.toProfile(user), tokens };
  }

  async logout(auth: Authenticated, meta: RequestMeta): Promise<void> {
    await this.sessions.revoke(auth.session.id, 'logout');
    await this.audit.record({
      action: 'auth.logout',
      actorUserId: auth.user.id,
      targetType: 'session',
      targetId: auth.session.id,
      ip: meta.ip,
    });
  }

  private async issueOtp(
    channel: OtpChannel,
    rawDestination: string,
    purpose: 'login' | 'verify_contact' | 'password_reset',
    userId?: string,
  ): Promise<OtpChallengeResponse> {
    const kind = contactKindFor(channel);
    const destination = normalizeContact(kind, rawDestination);
    if (!destination) {
      throw new ApiException(
        'VALIDATION_FAILED',
        kind === 'email' ? 'Enter a valid e-mail address' : 'Enter a valid phone number',
        HttpStatus.BAD_REQUEST,
      );
    }
    const { challenge, resendAvailableAt } = await this.otp.issue({
      channel,
      destination,
      purpose,
      userId,
    });
    return {
      challengeId: challenge.id,
      channel,
      destinationHint: maskContact(kind, destination),
      expiresAt: challenge.expiresAt.toISOString(),
      resendAvailableAt: resendAvailableAt.toISOString(),
    };
  }

  private async signIn(user: User, client: AuthClient, meta: RequestMeta): Promise<AuthResponse> {
    const tokens = await this.sessions.create(user.id, client, meta);
    return { user: this.users.toProfile(user), tokens };
  }

  private requireEmail(input: string): string {
    const email = normalizeEmail(input);
    if (!email) {
      throw new ApiException(
        'VALIDATION_FAILED',
        'Enter a valid e-mail address',
        HttpStatus.BAD_REQUEST,
      );
    }
    return email;
  }

  private assertActive(user: User): void {
    if (user.status !== 'active') {
      throw new ApiException('FORBIDDEN', 'This account is suspended', HttpStatus.FORBIDDEN);
    }
  }
}
