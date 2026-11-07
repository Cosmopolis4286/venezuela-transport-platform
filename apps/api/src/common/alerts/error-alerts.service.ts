import { Inject, Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import { AppConfigService } from '../../config/app-config.service.js';
import { MAILER, type Mailer } from '../../mail/mailer.js';
import { setErrorSink } from './error-alerts.js';

/** The same error is e-mailed at most once in this window. */
const SAME_ERROR_MS = 15 * 60_000;
/** And at most this many alerts per hour overall, so an outage cannot flood the inbox. */
const MAX_PER_HOUR = 10;

/**
 * E-mails `ALERT_EMAIL` when the API answers with an unexpected 500 (docs/deployment/monitoring.md).
 * Free and without extra services: it uses the same SMTP account as the rest of the e-mails.
 */
@Injectable()
export class ErrorAlertsService implements OnApplicationBootstrap {
  private readonly logger = new Logger(ErrorAlertsService.name);
  private readonly lastSent = new Map<string, number>();
  private sentThisHour: number[] = [];

  constructor(
    private readonly config: AppConfigService,
    @Inject(MAILER) private readonly mailer: Mailer,
  ) {}

  onApplicationBootstrap(): void {
    const to = this.config.get('ALERT_EMAIL');
    if (!to || !this.mailer.enabled) return;
    setErrorSink((error, request) => this.alert(to, error, `${request.method} ${request.path}`));
  }

  /** Sends (or skips, when throttled) one alert; returns whether it was sent. */
  alert(to: string, error: unknown, where: string, now = Date.now()): boolean {
    const message = error instanceof Error ? error.message : String(error);
    const signature = `${where} ${message}`.slice(0, 300);
    const last = this.lastSent.get(signature);
    this.sentThisHour = this.sentThisHour.filter((t) => now - t < 3_600_000);
    if ((last && now - last < SAME_ERROR_MS) || this.sentThisHour.length >= MAX_PER_HOUR) {
      return false;
    }
    this.lastSent.set(signature, now);
    this.sentThisHour.push(now);
    const stack = error instanceof Error ? (error.stack ?? message) : message;
    this.mailer
      .send({
        to,
        subject: `[VTP] Error en la API: ${message.slice(0, 80)}`,
        text: `${new Date(now).toISOString()}\n${where}\n\n${stack}\n\nVer los registros del servidor para el detalle.`,
      })
      .catch((sendError: unknown) =>
        this.logger.warn(`Could not send the error alert: ${(sendError as Error).message}`),
      );
    return true;
  }
}
