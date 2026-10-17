import { HttpStatus, Logger } from '@nestjs/common';
import type { OtpChannel, OtpPurpose } from '@vtp/shared-types';
import { ApiException } from '../../../common/errors/api.exception.js';
import { contactKindFor, maskContact } from '../contact.js';

export interface OtpMessage {
  channel: OtpChannel;
  destination: string;
  code: string;
  purpose: OtpPurpose;
  expiresAt: Date;
}

/** Delivers one-time codes. Implement one per provider (SMS, WhatsApp, e-mail) when chosen. */
export interface OtpSender {
  send(message: OtpMessage): Promise<void>;
}

export const OTP_SENDER = Symbol('OTP_SENDER');

/**
 * DEVELOPMENT ONLY: prints the code to the API log. Environment validation refuses
 * OTP_DELIVERY=console when NODE_ENV=production.
 */
export class ConsoleOtpSender implements OtpSender {
  private readonly logger = new Logger('OtpConsole');

  async send({ channel, destination, code, purpose }: OtpMessage): Promise<void> {
    const to = maskContact(contactKindFor(channel), destination);
    this.logger.warn(`[DEV ONLY] ${purpose} code for ${to} via ${channel}: ${code}`);
  }
}

/** Used until a real provider is configured: requesting a code fails with 503. */
export class DisabledOtpSender implements OtpSender {
  async send(): Promise<void> {
    throw new ApiException(
      'SERVICE_UNAVAILABLE',
      'One-time codes are not available yet',
      HttpStatus.SERVICE_UNAVAILABLE,
    );
  }
}
