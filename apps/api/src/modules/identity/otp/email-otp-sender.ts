import { HttpStatus } from '@nestjs/common';
import { notificationMessages } from '@vtp/shared-types';
import { ApiException } from '../../../common/errors/api.exception.js';
import type { Mailer } from '../../../mail/mailer.js';
import type { OtpMessage, OtpSender } from './otp-sender.js';

/**
 * Sends e-mail codes through the mailer (ADR-026). Codes by SMS or WhatsApp stay unavailable until
 * a provider is contracted: those requests get 503 so the app can offer e-mail instead.
 */
export class EmailOtpSender implements OtpSender {
  constructor(private readonly mailer: Mailer) {}

  async send({ channel, destination, code, expiresAt }: OtpMessage): Promise<void> {
    if (channel !== 'email') {
      throw new ApiException(
        'SERVICE_UNAVAILABLE',
        'Codes by SMS or WhatsApp are not available yet; use e-mail',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
    const minutes = Math.max(1, Math.round((expiresAt.getTime() - Date.now()) / 60_000));
    const messages = notificationMessages('es');
    const { title, body } = messages.otp(code, minutes);
    await this.mailer.send({
      to: destination,
      subject: title,
      text: `${body}\n\n${messages.footer}`,
    });
  }
}
