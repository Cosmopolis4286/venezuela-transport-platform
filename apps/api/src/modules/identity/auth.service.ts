import { HttpStatus, Injectable } from '@nestjs/common';
import type {
  AuthClient,
  AuthResponse,
  OtpChallengeResponse,
  OtpChannel,
  UserProfile,
} from '@vtp/shared-types';
import { ApiException } from '../../common/errors/api.exception.js';
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
    await this.audit.record({ action: 'auth.register', actorUserId: user.id, ip: meta.ip });
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
    input: { challengeId: string; code: string; client: AuthClient },
    meta: RequestMeta,
  ): Promise<AuthResponse> {
    const challenge = await this.otp.verify(input.challengeId, input.code, 'login');
    const user = await this.users.findOrCreateByVerifiedContact(
      contactKindFor(challenge.channel),
      challenge.destination,
    );
    this.assertActive(user);
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
    purpose: 'login' | 'verify_contact',
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
