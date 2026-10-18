import { randomInt, randomUUID } from 'node:crypto';
import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import type { OtpChannel, OtpPurpose } from '@vtp/shared-types';
import { and, count, desc, eq, gt, isNull, lt, sql } from 'drizzle-orm';
import { ApiException } from '../../../common/errors/api.exception.js';
import { AppConfigService } from '../../../config/app-config.service.js';
import { DatabaseService } from '../../../database/database.service.js';
import { TokenService } from '../crypto/token.service.js';
import { otpChallenges, type OtpChallenge } from '../identity.schema.js';
import { OTP_SENDER, type OtpSender } from './otp-sender.js';

export interface OtpIssueInput {
  channel: OtpChannel;
  /** Already normalized (E.164 or lower-case e-mail). */
  destination: string;
  purpose: OtpPurpose;
  userId?: string;
}

export interface IssuedOtp {
  challenge: OtpChallenge;
  resendAvailableAt: Date;
}

@Injectable()
export class OtpService {
  constructor(
    private readonly database: DatabaseService,
    private readonly tokens: TokenService,
    private readonly config: AppConfigService,
    @Inject(OTP_SENDER) private readonly sender: OtpSender,
  ) {}

  async issue(input: OtpIssueInput): Promise<IssuedOtp> {
    const db = this.database.db;
    const now = new Date();
    const resendMs = this.config.get('OTP_RESEND_SECONDS') * 1000;

    // Throttle per destination so nobody can flood a phone or inbox (and run up SMS costs).
    const [latest] = await db
      .select({ createdAt: otpChallenges.createdAt })
      .from(otpChallenges)
      .where(eq(otpChallenges.destination, input.destination))
      .orderBy(desc(otpChallenges.createdAt))
      .limit(1);
    if (latest && now.getTime() - latest.createdAt.getTime() < resendMs) {
      throw new ApiException(
        'RATE_LIMITED',
        'Please wait before requesting another code',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    const [hourly] = await db
      .select({ total: count() })
      .from(otpChallenges)
      .where(
        and(
          eq(otpChallenges.destination, input.destination),
          gt(otpChallenges.createdAt, new Date(now.getTime() - 3_600_000)),
        ),
      );
    if ((hourly?.total ?? 0) >= this.config.get('OTP_MAX_PER_HOUR')) {
      throw new ApiException(
        'RATE_LIMITED',
        'Too many codes requested, try again later',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const id = randomUUID();
    const code = randomInt(0, 1_000_000).toString().padStart(6, '0');
    const expiresAt = new Date(now.getTime() + this.config.get('OTP_TTL_MINUTES') * 60_000);
    const [challenge] = await db
      .insert(otpChallenges)
      .values({
        id,
        channel: input.channel,
        destination: input.destination,
        purpose: input.purpose,
        userId: input.userId,
        codeHash: this.codeHash(id, code),
        expiresAt,
      })
      .returning();

    try {
      await this.sender.send({ ...input, code, expiresAt });
    } catch (error) {
      // Undelivered codes must not count against the resend/hourly limits.
      await db.delete(otpChallenges).where(eq(otpChallenges.id, id));
      throw error;
    }
    return { challenge: challenge!, resendAvailableAt: new Date(now.getTime() + resendMs) };
  }

  /** Consumes the challenge on success. Every attempt counts toward OTP_MAX_ATTEMPTS. */
  async verify(challengeId: string, code: string, purpose: OtpPurpose): Promise<OtpChallenge> {
    const db = this.database.db;
    const [challenge] = await db
      .select()
      .from(otpChallenges)
      .where(eq(otpChallenges.id, challengeId))
      .limit(1);

    if (!challenge || challenge.purpose !== purpose || challenge.consumedAt) {
      throw this.invalid();
    }
    if (challenge.expiresAt <= new Date()) {
      throw new ApiException(
        'OTP_EXPIRED',
        'The code has expired, request a new one',
        HttpStatus.BAD_REQUEST,
      );
    }
    // Count the attempt atomically before comparing, so parallel guesses cannot exceed the limit.
    const [attempt] = await db
      .update(otpChallenges)
      .set({ attempts: sql`${otpChallenges.attempts} + 1` })
      .where(
        and(
          eq(otpChallenges.id, challenge.id),
          lt(otpChallenges.attempts, this.config.get('OTP_MAX_ATTEMPTS')),
        ),
      )
      .returning({ id: otpChallenges.id });
    if (!attempt) {
      throw new ApiException(
        'OTP_EXPIRED',
        'Too many attempts, request a new code',
        HttpStatus.BAD_REQUEST,
      );
    }
    if (!this.tokens.matches(this.codeKey(challenge.id, code), challenge.codeHash)) {
      throw this.invalid();
    }

    // Conditional update makes the code single-use even under concurrent requests.
    const [consumed] = await db
      .update(otpChallenges)
      .set({ consumedAt: new Date() })
      .where(and(eq(otpChallenges.id, challenge.id), isNull(otpChallenges.consumedAt)))
      .returning();
    if (!consumed) throw this.invalid();
    return consumed;
  }

  private codeKey(challengeId: string, code: string): string {
    return `otp:${challengeId}:${code}`;
  }

  private codeHash(challengeId: string, code: string): string {
    return this.tokens.hash(this.codeKey(challengeId, code));
  }

  private invalid(): ApiException {
    return new ApiException('OTP_INVALID', 'The code is not valid', HttpStatus.BAD_REQUEST);
  }
}
