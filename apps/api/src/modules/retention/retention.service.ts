import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { and, eq, inArray, isNotNull, lt, ne, or, sql } from 'drizzle-orm';
import { AppConfigService } from '../../config/app-config.service.js';
import { DatabaseService } from '../../database/database.service.js';
import { FILE_STORAGE, type FileStorage } from '../../storage/file-storage.js';
import { auditEvents } from '../audit/audit.schema.js';
import { bookingPassengers } from '../bookings/bookings.schema.js';
import { otpChallenges, sessions, users } from '../identity/identity.schema.js';
import { notifications } from '../notifications/notifications.schema.js';
import { applicationDocuments, applications } from '../onboarding/onboarding.schema.js';
import { taxiRides } from '../taxi/taxi.schema.js';

const SWEEP_EVERY_MS = 24 * 3_600_000;
const DAY_MS = 24 * 3_600_000;
/** Placeholder written over erased names and document numbers (the columns are NOT NULL). */
export const ERASED = '—';

/** Retention periods from docs/legal/conservacion-y-borrado.md. Change both together. */
export const RETENTION = {
  otpChallengesDays: 365,
  notificationsDays: 365,
  auditEventsDays: 2 * 365,
  /** Revoked or expired sessions are useless; kept a month for incident review. */
  deadSessionsDays: 30,
  passengersYears: 10,
  taxiRidesYears: 5,
  /** After the review of an application that no longer works (rejected, or account deleted). */
  kycYears: 5,
} as const;

export interface RetentionResult {
  otpChallenges: number;
  notifications: number;
  auditEvents: number;
  sessions: number;
  passengers: number;
  taxiRides: number;
  applications: number;
  files: number;
}

/**
 * Daily purge of the personal data whose retention period ended. Records the law requires to
 * keep for accounting (bookings, payments, settlements) are kept; only the personal data in them
 * is erased. Idempotent: safe to run on several instances or more than once.
 */
@Injectable()
export class RetentionService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(RetentionService.name);
  private timer: NodeJS.Timeout | undefined;

  constructor(
    private readonly database: DatabaseService,
    private readonly config: AppConfigService,
    @Inject(FILE_STORAGE) private readonly storage: FileStorage,
  ) {}

  onApplicationBootstrap(): void {
    // Tests call sweep() themselves.
    if (this.config.get('NODE_ENV') === 'test') return;
    const run = (): void => {
      this.sweep()
        .then((result) => this.logger.log(`Retention sweep: ${JSON.stringify(result)}`))
        .catch((error: unknown) =>
          this.logger.error(`Retention sweep failed: ${(error as Error).message}`),
        );
    };
    // First run a few minutes after start, then once a day.
    setTimeout(run, 5 * 60_000).unref();
    this.timer = setInterval(run, SWEEP_EVERY_MS);
    this.timer.unref();
  }

  onApplicationShutdown(): void {
    clearInterval(this.timer);
  }

  async sweep(now = new Date()): Promise<RetentionResult> {
    const db = this.database.db;
    const daysAgo = (days: number) => new Date(now.getTime() - days * DAY_MS);
    const yearsAgo = (years: number) => {
      const date = new Date(now);
      date.setUTCFullYear(date.getUTCFullYear() - years);
      return date;
    };

    const otp = await db
      .delete(otpChallenges)
      .where(lt(otpChallenges.createdAt, daysAgo(RETENTION.otpChallengesDays)))
      .returning({ id: otpChallenges.id });
    const sent = await db
      .delete(notifications)
      .where(lt(notifications.createdAt, daysAgo(RETENTION.notificationsDays)))
      .returning({ id: notifications.id });
    const audit = await db
      .delete(auditEvents)
      .where(lt(auditEvents.createdAt, daysAgo(RETENTION.auditEventsDays)))
      .returning({ id: auditEvents.id });
    const deadBefore = daysAgo(RETENTION.deadSessionsDays);
    const dead = await db
      .delete(sessions)
      .where(or(lt(sessions.revokedAt, deadBefore), lt(sessions.refreshExpiresAt, deadBefore)))
      .returning({ id: sessions.id });

    const passengers = await db
      .update(bookingPassengers)
      .set({ firstName: ERASED, lastName: ERASED, documentNumber: ERASED })
      .where(
        and(
          lt(bookingPassengers.createdAt, yearsAgo(RETENTION.passengersYears)),
          ne(bookingPassengers.documentNumber, ERASED),
        ),
      )
      .returning({ id: bookingPassengers.id });

    const rides = await db
      .update(taxiRides)
      .set({ address: ERASED, notes: null, contactPhone: null })
      .where(
        and(
          lt(taxiRides.createdAt, yearsAgo(RETENTION.taxiRidesYears)),
          ne(taxiRides.address, ERASED),
        ),
      )
      .returning({ id: taxiRides.id });

    const { applications: erased, files } = await this.eraseKyc(yearsAgo(RETENTION.kycYears));

    return {
      otpChallenges: otp.length,
      notifications: sent.length,
      auditEvents: audit.length,
      sessions: dead.length,
      passengers: passengers.length,
      taxiRides: rides.length,
      applications: erased,
      files,
    };
  }

  /**
   * KYC files and data of applications reviewed before `before` that no longer belong to someone
   * working: rejected ones, and any whose account was deleted.
   */
  private async eraseKyc(before: Date): Promise<{ applications: number; files: number }> {
    const db = this.database.db;
    const expired = await db
      .select({ id: applications.id })
      .from(applications)
      .innerJoin(users, eq(users.id, applications.userId))
      .where(
        and(
          isNotNull(applications.reviewedAt),
          lt(applications.reviewedAt, before),
          ne(applications.documentNumber, ERASED),
          or(eq(applications.status, 'rejected'), eq(users.status, 'deleted')),
        ),
      );
    if (!expired.length) return { applications: 0, files: 0 };
    const ids = expired.map((a) => a.id);
    const documents = await db
      .select({ id: applicationDocuments.id, storageKey: applicationDocuments.storageKey })
      .from(applicationDocuments)
      .where(inArray(applicationDocuments.applicationId, ids));
    // Files first: if deleting one fails, the row stays and the next sweep retries it.
    let files = 0;
    for (const document of documents) {
      try {
        await this.storage.delete(document.storageKey);
        await db.delete(applicationDocuments).where(eq(applicationDocuments.id, document.id));
        files += 1;
      } catch (error) {
        this.logger.warn(`Could not delete KYC file ${document.id}: ${(error as Error).message}`);
      }
    }
    const remaining = await db
      .select({ applicationId: applicationDocuments.applicationId })
      .from(applicationDocuments)
      .where(inArray(applicationDocuments.applicationId, ids));
    const pending = new Set(remaining.map((d) => d.applicationId));
    const done = ids.filter((id) => !pending.has(id));
    if (done.length) {
      await db
        .update(applications)
        .set({
          firstName: ERASED,
          lastName: ERASED,
          documentNumber: ERASED,
          birthDate: '1900-01-01',
          state: null,
          city: null,
          vehicle: null,
          reviewNotes: null,
          updatedAt: sql`now()`,
        })
        .where(inArray(applications.id, done));
    }
    return { applications: done.length, files };
  }
}
