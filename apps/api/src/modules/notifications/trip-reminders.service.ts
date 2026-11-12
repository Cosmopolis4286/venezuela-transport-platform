import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { longDate, toNetworkIso, TRIP_PACK_EXPIRY_NOTICE_DAYS } from '@vtp/shared-types';
import { and, eq, gt, inArray, isNull, lte } from 'drizzle-orm';
import { AppConfigService } from '../../config/app-config.service.js';
import { DatabaseService } from '../../database/database.service.js';
import { bookings, trips } from '../bookings/bookings.schema.js';
import { routes, stops } from '../network/network.schema.js';
import { tripPacks } from '../trip-packs/trip-packs.schema.js';
import { departureText } from './format.js';
import { NotificationsService } from './notifications.service.js';

const SWEEP_EVERY_MS = 5 * 60_000;

/**
 * Reminds passengers of their trip a few hours before boarding (`TRIP_REMINDER_HOURS`). A sweep
 * every 5 minutes marks each booking as reminded with one UPDATE … RETURNING, so a booking is
 * reminded once even with several API instances.
 */
@Injectable()
export class TripRemindersService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(TripRemindersService.name);
  private timer: NodeJS.Timeout | undefined;

  constructor(
    private readonly database: DatabaseService,
    private readonly config: AppConfigService,
    private readonly notifications: NotificationsService,
  ) {}

  onApplicationBootstrap(): void {
    // Tests call sweep() themselves.
    if (this.config.get('NODE_ENV') === 'test') return;
    this.timer = setInterval(() => {
      this.sweep().catch((error: unknown) =>
        this.logger.error(`Trip reminder sweep failed: ${(error as Error).message}`),
      );
      this.sweepPacks().catch((error: unknown) =>
        this.logger.error(`Trip pack reminder sweep failed: ${(error as Error).message}`),
      );
    }, SWEEP_EVERY_MS);
    this.timer.unref();
  }

  onApplicationShutdown(): void {
    clearInterval(this.timer);
  }

  /** Sends the reminders that are due now; returns how many bookings were reminded. */
  async sweep(now = new Date()): Promise<number> {
    const hours = this.config.get('TRIP_REMINDER_HOURS');
    if (!hours) return 0;
    const due = await this.database.db
      .update(bookings)
      .set({ reminderSentAt: now })
      .where(
        and(
          eq(bookings.status, 'confirmed'),
          isNull(bookings.reminderSentAt),
          gt(bookings.departsAt, now),
          lte(bookings.departsAt, new Date(now.getTime() + hours * 3_600_000)),
        ),
      )
      .returning({
        id: bookings.id,
        userId: bookings.userId,
        tripId: bookings.tripId,
        fromStopId: bookings.fromStopId,
        departsAt: bookings.departsAt,
      });
    if (!due.length) return 0;
    const details = await this.database.db
      .select({ tripId: trips.id, route: routes.name })
      .from(trips)
      .innerJoin(routes, eq(routes.id, trips.routeId))
      .where(inArray(trips.id, [...new Set(due.map((b) => b.tripId))]));
    const stopNames = await this.database.db
      .select({ id: stops.id, name: stops.name })
      .from(stops)
      .where(inArray(stops.id, [...new Set(due.map((b) => b.fromStopId))]));
    for (const booking of due) {
      const route = details.find((d) => d.tripId === booking.tripId)?.route ?? '';
      const from = stopNames.find((s) => s.id === booking.fromStopId)?.name ?? '';
      this.notifications.send({
        kind: 'trip_reminder',
        userIds: [booking.userId],
        app: 'passenger',
        reference: { key: 'bookingId', id: booking.id },
        text: (m, locale) => m.tripReminder(route, departureText(booking.departsAt, locale), from),
      });
    }
    return due.length;
  }

  /**
   * Reminds passengers of packs with trips left that expire within
   * `TRIP_PACK_EXPIRY_NOTICE_DAYS` (once per pack); returns how many were reminded.
   */
  async sweepPacks(now = new Date()): Promise<number> {
    const due = await this.database.db
      .update(tripPacks)
      .set({ expiryNoticeSentAt: now })
      .where(
        and(
          eq(tripPacks.status, 'active'),
          gt(tripPacks.remaining, 0),
          isNull(tripPacks.expiryNoticeSentAt),
          gt(tripPacks.expiresAt, now),
          lte(
            tripPacks.expiresAt,
            new Date(now.getTime() + TRIP_PACK_EXPIRY_NOTICE_DAYS * 86_400_000),
          ),
        ),
      )
      .returning();
    for (const pack of due) {
      this.notifications.send({
        kind: 'trip_pack_expiring',
        userIds: [pack.userId],
        app: 'passenger',
        email: true,
        reference: { key: 'tripPackId', id: pack.id },
        text: (m, locale) =>
          m.tripPackExpiring(
            pack.code,
            pack.remaining,
            longDate(toNetworkIso(pack.expiresAt!), locale),
          ),
      });
    }
    return due.length;
  }
}
