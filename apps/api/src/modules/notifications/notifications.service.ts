import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  notificationMessages,
  type Locale,
  type NotificationKind,
  type NotificationMessages,
  type NotificationText,
  type PushApp,
  type RegisterPushDeviceRequest,
} from '@vtp/shared-types';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { DatabaseService } from '../../database/database.service.js';
import { MAILER, type Mailer } from '../../mail/mailer.js';
import { bookings, trips } from '../bookings/bookings.schema.js';
import { users } from '../identity/identity.schema.js';
import { routes } from '../network/network.schema.js';
import { notifications, pushDevices } from './notifications.schema.js';
import { PUSH_SENDER, type PushSender } from './push-sender.js';

export interface Notice {
  kind: NotificationKind;
  /** People to notify. */
  userIds: string[];
  /** The text in each recipient's language (amounts and dates formatted for it). */
  text: (messages: NotificationMessages, locale: Locale) => NotificationText;
  /** Push goes to this app's devices only. */
  app: PushApp;
  email?: boolean;
  /** The booking, trip or ride it is about; also passed to the app to open it. */
  reference?: { key: 'bookingId' | 'tripId' | 'rideId'; id: string };
}

/**
 * Sends push notifications and e-mails after the fact (ADR-026). Never throws into the caller:
 * a notice that fails is logged, and the action that caused it has already happened.
 */
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  private readonly pending = new Set<Promise<void>>();

  constructor(
    private readonly database: DatabaseService,
    @Inject(MAILER) private readonly mailer: Mailer,
    @Inject(PUSH_SENDER) private readonly push: PushSender,
  ) {}

  // --- Devices --------------------------------------------------------------------------------

  /** Registers a device token for the caller; a token used by someone else moves to them. */
  async register(userId: string, input: RegisterPushDeviceRequest): Promise<void> {
    const values = {
      userId,
      app: input.app,
      platform: input.platform,
      locale: input.locale,
      lastSeenAt: new Date(),
    };
    await this.database.db
      .insert(pushDevices)
      .values({ token: input.token, ...values })
      .onConflictDoUpdate({ target: pushDevices.token, set: values });
  }

  async unregister(userId: string, token: string): Promise<void> {
    await this.database.db
      .delete(pushDevices)
      .where(and(eq(pushDevices.userId, userId), eq(pushDevices.token, token)));
  }

  /** What notices about a booking need: who, its code, route and boarding time. */
  async booking(bookingId: string) {
    const [row] = await this.database.db
      .select({
        userId: bookings.userId,
        code: bookings.code,
        departsAt: bookings.departsAt,
        route: routes.name,
      })
      .from(bookings)
      .innerJoin(trips, eq(trips.id, bookings.tripId))
      .innerJoin(routes, eq(routes.id, trips.routeId))
      .where(eq(bookings.id, bookingId));
    if (!row) throw new Error(`Booking ${bookingId} not found`);
    return row;
  }

  // --- Sending --------------------------------------------------------------------------------

  /** Queues a notice and returns at once. */
  send(notice: Notice): void {
    this.later(async () => notice);
  }

  /** Like `send`, but the notice (and the queries it needs) is built in the background too. */
  later(build: () => Promise<Notice | null>): void {
    const task = build()
      .then((notice) => (notice?.userIds.length ? this.deliver(notice) : undefined))
      .catch((error: unknown) =>
        this.logger.error(`Could not send a notification: ${(error as Error).message}`),
      )
      .finally(() => this.pending.delete(task));
    this.pending.add(task);
  }

  /** Resolves when every queued notice was handled (tests, shutdown). */
  async settled(): Promise<void> {
    while (this.pending.size) await Promise.all([...this.pending]);
  }

  private async deliver(notice: Notice): Promise<void> {
    const userIds = [...new Set(notice.userIds)];
    const devices = this.push.enabled
      ? await this.database.db
          .select()
          .from(pushDevices)
          .where(and(inArray(pushDevices.userId, userIds), eq(pushDevices.app, notice.app)))
          .orderBy(desc(pushDevices.lastSeenAt))
      : [];
    const people =
      notice.email && this.mailer.enabled
        ? await this.database.db
            .select({ id: users.id, email: users.email })
            .from(users)
            .where(inArray(users.id, userIds))
        : [];
    // The language of someone's most recently used device, Spanish otherwise.
    const localeOf = (userId: string): Locale =>
      devices.find((d) => d.userId === userId)?.locale ?? 'es';
    const reference = notice.reference?.id ?? null;
    const log: (typeof notifications.$inferInsert)[] = [];

    if (devices.length) {
      const messages = devices.map((device) => {
        const { title, body } = notice.text(notificationMessages(device.locale), device.locale);
        return {
          to: device.token,
          title,
          body,
          data: notice.reference ? { [notice.reference.key]: notice.reference.id } : undefined,
        };
      });
      const notified = [...new Set(devices.map((d) => d.userId))];
      try {
        const { invalidTokens } = await this.push.send(messages);
        if (invalidTokens.length) {
          await this.database.db
            .delete(pushDevices)
            .where(inArray(pushDevices.token, invalidTokens));
        }
        for (const userId of notified) {
          log.push({ userId, kind: notice.kind, channel: 'push', status: 'sent', reference });
        }
      } catch (error) {
        for (const userId of notified) {
          log.push({
            userId,
            kind: notice.kind,
            channel: 'push',
            status: 'failed',
            reference,
            error: (error as Error).message.slice(0, 500),
          });
        }
      }
    }

    for (const person of people) {
      if (!person.email) continue;
      const locale = localeOf(person.id);
      const messages = notificationMessages(locale);
      const { title, body } = notice.text(messages, locale);
      try {
        await this.mailer.send({
          to: person.email,
          subject: title,
          text: `${body}\n\n${messages.footer}`,
        });
        log.push({
          userId: person.id,
          kind: notice.kind,
          channel: 'email',
          status: 'sent',
          reference,
        });
      } catch (error) {
        log.push({
          userId: person.id,
          kind: notice.kind,
          channel: 'email',
          status: 'failed',
          reference,
          error: (error as Error).message.slice(0, 500),
        });
      }
    }
    if (log.length) await this.database.db.insert(notifications).values(log);
  }
}
