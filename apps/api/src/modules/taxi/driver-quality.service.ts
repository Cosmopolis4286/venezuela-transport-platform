import { HttpStatus, Injectable } from '@nestjs/common';
import {
  DRIVER_RATING_MIN_COUNT,
  DRIVER_RATING_SUSPEND_BELOW,
  DRIVER_RATING_WARN_BELOW,
  DRIVER_RATING_WINDOW,
  type DriverRating,
  type DriverSuspension,
  type LiftDriverSuspensionRequest,
} from '@vtp/shared-types';
import { and, desc, eq, gt, inArray, isNotNull, isNull, lte, sql } from 'drizzle-orm';
import { ApiException } from '../../common/errors/api.exception.js';
import { DatabaseService } from '../../database/database.service.js';
import { AuditService } from '../audit/audit.service.js';
import { users } from '../identity/identity.schema.js';
import type { Authenticated, RequestMeta } from '../identity/sessions.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { memberships, organizations } from '../organizations/organizations.schema.js';
import {
  driverPresence,
  driverQualityActions,
  taxiRides,
  type DriverQualityActionRow,
} from './taxi.schema.js';

/** A warning or an alert to a line is repeated at most this often. */
const NOTICE_EVERY_MS = 30 * 86_400_000;

const display = (average: number) =>
  average.toLocaleString('es-VE', { minimumFractionDigits: 1, maximumFractionDigits: 2 });

/**
 * Driver quality from passengers' ratings (ADR-044). Evaluated each time a ride is rated: the
 * average of the driver's last ratings warns them, suspends them from the platform's independent
 * drivers' line, or alerts the owners of any other line, who decide.
 */
@Injectable()
export class DriverQualityService {
  constructor(
    private readonly database: DatabaseService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  /** The average of the last ratings since their last lifted suspension, if any. */
  async rating(userId: string): Promise<DriverRating> {
    const db = this.database.db;
    const [lifted] = await db
      .select({ at: driverQualityActions.liftedAt })
      .from(driverQualityActions)
      .where(and(eq(driverQualityActions.userId, userId), isNotNull(driverQualityActions.liftedAt)))
      .orderBy(desc(driverQualityActions.liftedAt))
      .limit(1);
    const recent = await db
      .select({ rating: taxiRides.rating })
      .from(taxiRides)
      .where(
        and(
          eq(taxiRides.driverUserId, userId),
          isNotNull(taxiRides.rating),
          ...(lifted?.at ? [gt(taxiRides.ratedAt, lifted.at)] : []),
        ),
      )
      .orderBy(desc(taxiRides.ratedAt))
      .limit(DRIVER_RATING_WINDOW);
    if (!recent.length) return { average: null, count: 0 };
    const sum = recent.reduce((total, r) => total + r.rating!, 0);
    return { average: Math.round((sum / recent.length) * 100) / 100, count: recent.length };
  }

  /** The lines the driver is suspended from. */
  async suspendedLines(userId: string): Promise<Set<string>> {
    const rows = await this.database.db
      .select({ organizationId: driverQualityActions.organizationId })
      .from(driverQualityActions)
      .where(
        and(
          eq(driverQualityActions.userId, userId),
          eq(driverQualityActions.kind, 'suspension'),
          isNull(driverQualityActions.liftedAt),
        ),
      );
    return new Set(rows.map((r) => r.organizationId));
  }

  async activeSuspension(userId: string): Promise<DriverQualityActionRow | null> {
    const [row] = await this.database.db
      .select()
      .from(driverQualityActions)
      .where(
        and(
          eq(driverQualityActions.userId, userId),
          eq(driverQualityActions.kind, 'suspension'),
          isNull(driverQualityActions.liftedAt),
        ),
      )
      .orderBy(desc(driverQualityActions.createdAt))
      .limit(1);
    return row ?? null;
  }

  /** After a passenger rates a ride of this driver in this line. */
  async evaluate(userId: string, organizationId: string): Promise<void> {
    const { average, count } = await this.rating(userId);
    if (
      average === null ||
      count < DRIVER_RATING_MIN_COUNT ||
      average >= DRIVER_RATING_WARN_BELOW
    ) {
      return;
    }
    const db = this.database.db;
    const [line] = await db
      .select({
        operatedByPlatform: organizations.operatedByPlatform,
        legalName: organizations.legalName,
        tradeName: organizations.tradeName,
      })
      .from(organizations)
      .where(eq(organizations.id, organizationId));
    if (!line) return;
    const record = (kind: DriverQualityActionRow['kind']) =>
      db
        .insert(driverQualityActions)
        .values({ userId, organizationId, kind, average, ratings: count })
        .onConflictDoNothing()
        .returning({ id: driverQualityActions.id });

    if (line.operatedByPlatform && average < DRIVER_RATING_SUSPEND_BELOW) {
      const [created] = await record('suspension');
      if (!created) return; // already suspended
      // Off the road at once: offline and out of the line's requests.
      await db.delete(driverPresence).where(eq(driverPresence.userId, userId));
      await this.audit.record({
        action: 'driver.suspended',
        targetType: 'user',
        targetId: userId,
        metadata: { organizationId, average, ratings: count },
      });
      this.notifications.send({
        kind: 'driver_quality',
        userIds: [userId],
        app: 'transport',
        email: true,
        text: (m) => m.driverRatingLow(display(average), true),
      });
      return;
    }

    // A warning to the driver, and for other lines an alert to their owners, once a month.
    const recently = async (kind: DriverQualityActionRow['kind']) =>
      (
        await db
          .select({ id: driverQualityActions.id })
          .from(driverQualityActions)
          .where(
            and(
              eq(driverQualityActions.userId, userId),
              eq(driverQualityActions.organizationId, organizationId),
              eq(driverQualityActions.kind, kind),
              gt(driverQualityActions.createdAt, new Date(Date.now() - NOTICE_EVERY_MS)),
            ),
          )
          .limit(1)
      ).length > 0;
    if (!(await recently('warning'))) {
      await record('warning');
      this.notifications.send({
        kind: 'driver_quality',
        userIds: [userId],
        app: 'transport',
        email: true,
        text: (m) => m.driverRatingLow(display(average), false),
      });
    }
    if (!line.operatedByPlatform && average < DRIVER_RATING_SUSPEND_BELOW) {
      if (await recently('line_alert')) return;
      await record('line_alert');
      const [driver] = await db.select().from(users).where(eq(users.id, userId));
      const name =
        [driver?.firstName, driver?.lastName].filter(Boolean).join(' ') || 'Un conductor';
      this.notifications.later(async () => ({
        kind: 'driver_quality',
        userIds: (
          await db
            .select({ userId: memberships.userId })
            .from(memberships)
            .where(
              and(
                eq(memberships.organizationId, organizationId),
                inArray(memberships.role, ['owner', 'admin']),
              ),
            )
        ).map((m) => m.userId),
        app: 'transport',
        email: true,
        reference: { key: 'organizationId', id: organizationId },
        text: (m) => m.lineDriverRatingLow(name, display(average)),
      }));
    }
  }

  /** Suspensions for the platform team: active ones first, then the last lifted. */
  async suspensions(): Promise<DriverSuspension[]> {
    const db = this.database.db;
    const rows = await db
      .select({ action: driverQualityActions, user: users, line: organizations })
      .from(driverQualityActions)
      .innerJoin(users, eq(users.id, driverQualityActions.userId))
      .innerJoin(organizations, eq(organizations.id, driverQualityActions.organizationId))
      .where(eq(driverQualityActions.kind, 'suspension'))
      .orderBy(
        sql`${driverQualityActions.liftedAt} is not null`,
        desc(driverQualityActions.createdAt),
      )
      .limit(100);
    return Promise.all(
      rows.map(async ({ action, user, line }) => ({
        id: action.id,
        driver: {
          userId: user.id,
          name: [user.firstName, user.lastName].filter(Boolean).join(' ') || 'Sin nombre',
          phone: user.phone,
        },
        line: { id: line.id, name: line.tradeName ?? line.legalName },
        average: action.average,
        ratings: action.ratings,
        createdAt: action.createdAt.toISOString(),
        liftedAt: action.liftedAt?.toISOString() ?? null,
        liftNotes: action.liftNotes,
        comments: (
          await db
            .select({
              rating: taxiRides.rating,
              comment: taxiRides.ratingComment,
              ratedAt: taxiRides.ratedAt,
            })
            .from(taxiRides)
            .where(
              and(
                eq(taxiRides.driverUserId, user.id),
                lte(taxiRides.rating, 2),
                isNotNull(taxiRides.ratingComment),
              ),
            )
            .orderBy(desc(taxiRides.ratedAt))
            .limit(10)
        ).map((c) => ({
          rating: c.rating!,
          comment: c.comment!,
          ratedAt: c.ratedAt!.toISOString(),
        })),
      })),
    );
  }

  /** The team reviewed it: the driver can go online again, and only newer ratings count. */
  async lift(
    auth: Authenticated,
    suspensionId: string,
    input: LiftDriverSuspensionRequest,
    meta: RequestMeta,
  ): Promise<void> {
    const notes = input.notes.trim();
    const [row] = await this.database.db
      .update(driverQualityActions)
      .set({ liftedAt: new Date(), liftedBy: auth.user.id, liftNotes: notes })
      .where(
        and(
          eq(driverQualityActions.id, suspensionId),
          eq(driverQualityActions.kind, 'suspension'),
          isNull(driverQualityActions.liftedAt),
        ),
      )
      .returning();
    if (!row) {
      throw new ApiException(
        'NOT_FOUND',
        'No active suspension with that id',
        HttpStatus.NOT_FOUND,
      );
    }
    await this.audit.record({
      action: 'driver.suspension_lifted',
      actorUserId: auth.user.id,
      targetType: 'user',
      targetId: row.userId,
      ip: meta.ip,
    });
    this.notifications.send({
      kind: 'driver_quality',
      userIds: [row.userId],
      app: 'transport',
      email: true,
      text: (m) => m.driverSuspensionLifted(notes.endsWith('.') ? notes : `${notes}.`),
    });
  }
}
