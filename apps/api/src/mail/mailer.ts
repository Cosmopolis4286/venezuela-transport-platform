import { Logger } from '@nestjs/common';
import { createTransport, type Transporter } from 'nodemailer';

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
}

/** Sends e-mail. `MAIL_DELIVERY` picks the implementation (see MailModule). */
export interface Mailer {
  /** False when mail is turned off, so callers can say so instead of pretending. */
  readonly enabled: boolean;
  send(message: MailMessage): Promise<void>;
}

export const MAILER = Symbol('MAILER');

/** DEVELOPMENT ONLY: writes the message to the log. Refused in production. */
export class ConsoleMailer implements Mailer {
  readonly enabled = true;
  private readonly logger = new Logger('MailConsole');

  async send({ to, subject, text }: MailMessage): Promise<void> {
    this.logger.warn(`[DEV ONLY] e-mail to ${to}: ${subject}\n${text}`);
  }
}

/** Any SMTP server: a provider in production, Mailpit (port 1025) in development. */
export class SmtpMailer implements Mailer {
  readonly enabled = true;
  private readonly transport: Transporter;

  constructor(
    options: { host: string; port: number; secure: boolean; user: string; password: string },
    private readonly from: string,
  ) {
    this.transport = createTransport({
      host: options.host,
      port: options.port,
      secure: options.secure,
      auth: options.user ? { user: options.user, pass: options.password } : undefined,
    });
  }

  async send({ to, subject, text }: MailMessage): Promise<void> {
    await this.transport.sendMail({ from: this.from, to, subject, text });
  }
}

export class DisabledMailer implements Mailer {
  readonly enabled = false;
  async send(): Promise<void> {}
}
