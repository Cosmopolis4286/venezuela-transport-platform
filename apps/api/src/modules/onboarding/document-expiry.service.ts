import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import {
  DOCUMENT_EXPIRY_NOTICE_DAYS,
  ORGANIZATION_ROLES,
  RENEWABLE_DOCUMENT_KINDS,
  longDate,
  roleHasPermission,
  todayInVenezuela,
  type RenewableDocumentKind,
} from '@vtp/shared-types';
import { and, eq, inArray, isNotNull, isNull, lte, sql } from 'drizzle-orm';
import { AppConfigService } from '../../config/app-config.service.js';
import { DatabaseService } from '../../database/database.service.js';
import { vehicleDocuments, vehicles } from '../fleet/fleet.schema.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { memberships, organizations } from '../organizations/organizations.schema.js';
import { driverPresence } from '../taxi/taxi.schema.js';
import { applicationDocuments, applications, documentExpiryNotices } from './onboarding.schema.js';

const SWEEP_EVERY_MS = 60 * 60_000;
/** Roles that look after a line's or company's fleet: they hear about its vehicles' papers. */
const FLEET_ROLES = ORGANIZATION_ROLES.filter((role) => roleHasPermission(role, 'fleet.manage'));

/**
 * Document expiry (ADR-042). Every hour: reminds drivers whose licence, medical certificate or
 * RCV policy expires within `DOCUMENT_EXPIRY_NOTICE_DAYS` and again on expiry, reminds fleet
 * managers of their vehicles' papers, and takes offline the drivers whose licence or medical
 * certificate expired. Each reminder is recorded first (insert … on conflict do nothing), so it is
 * sent once even with several API instances, and again for the next expiry date after renewing.
 */
@Injectable()
export class DocumentExpiryService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(DocumentExpiryService.name);
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
        this.logger.error(`Document expiry sweep failed: ${(error as Error).message}`),
      );
    }, SWEEP_EVERY_MS);
    this.timer.unref();
  }

  onApplicationShutdown(): void {
    clearInterval(this.timer);
  }

  /** Returns how many reminders went out and how many drivers were taken offline. */
  async sweep(now = new Date()): Promise<{ reminded: number; offline: number }> {
    const today = todayInVenezuela(now);
    const until = new Date(`${today}T00:00:00Z`);
    until.setUTCDate(until.getUTCDate() + DOCUMENT_EXPIRY_NOTICE_DAYS);
    const horizon = until.toISOString().slice(0, 10);
    const db = this.database.db;
    let reminded = 0;

    // Drivers' documents, in approved applications.
    const documents = await db
      .select({
        id: applicationDocuments.id,
        kind: applicationDocuments.kind,
        expiresOn: applicationDocuments.expiresOn,
        userId: applications.userId,
        applicationId: applications.id,
      })
      .from(applicationDocuments)
      .innerJoin(applications, eq(applications.id, applicationDocuments.applicationId))
      .where(
        and(
          eq(applications.status, 'approved'),
          inArray(applicationDocuments.kind, [...RENEWABLE_DOCUMENT_KINDS]),
          isNotNull(applicationDocuments.expiresOn),
          lte(applicationDocuments.expiresOn, horizon),
        ),
      );
    for (const document of documents) {
      const expiresOn = document.expiresOn!;
      const expired = expiresOn < today;
      if (!(await this.firstNotice(`application:${document.id}`, expiresOn, expired))) continue;
      const kind = document.kind as RenewableDocumentKind;
      this.notifications.send({
        kind: 'document_expiring',
        userIds: [document.userId],
        app: 'transport',
        email: true,
        reference: { key: 'applicationId', id: document.applicationId },
        text: (m, locale) => m.documentExpiring(kind, longDate(expiresOn, locale), expired),
      });
      reminded += 1;
    }

    // Vehicles' papers of companies and lines. An independent's RCV is reminded above.
    const papers = await db
      .select({
        vehicleId: vehicles.id,
        organizationId: vehicles.organizationId,
        plate: vehicles.plate,
        kind: vehicleDocuments.kind,
        expiresOn: vehicleDocuments.expiresOn,
      })
      .from(vehicleDocuments)
      .innerJoin(vehicles, eq(vehicles.id, vehicleDocuments.vehicleId))
      .innerJoin(organizations, eq(organizations.id, vehicles.organizationId))
      .where(
        and(
          eq(vehicles.active, true),
          isNull(vehicles.ownerUserId),
          eq(organizations.status, 'active'),
          lte(vehicleDocuments.expiresOn, horizon),
        ),
      );
    for (const paper of papers) {
      const expired = paper.expiresOn < today;
      const subject = `vehicle:${paper.vehicleId}:${paper.kind}`;
      if (!(await this.firstNotice(subject, paper.expiresOn, expired))) continue;
      const managers = await db
        .select({ userId: memberships.userId })
        .from(memberships)
        .where(
          and(
            eq(memberships.organizationId, paper.organizationId),
            inArray(memberships.role, FLEET_ROLES),
          ),
        );
      this.notifications.send({
        kind: 'document_expiring',
        userIds: managers.map((m) => m.userId),
        app: 'transport',
        email: true,
        reference: { key: 'organizationId', id: paper.organizationId },
        text: (m, locale) =>
          m.vehicleDocumentExpiring(
            paper.plate,
            paper.kind,
            longDate(paper.expiresOn, locale),
            expired,
          ),
      });
      reminded += 1;
    }

    // Nobody drives with an expired licence or medical certificate.
    const offline = await db
      .delete(driverPresence)
      .where(
        sql`${driverPresence.userId} in (
          select ${applications.userId} from ${applications}
          join ${applicationDocuments} on ${applicationDocuments.applicationId} = ${applications.id}
          where ${applications.status} = 'approved'
            and ${applicationDocuments.kind} in ('driver_license', 'medical_certificate')
            and ${applicationDocuments.expiresOn} < ${today}
        )`,
      )
      .returning({ userId: driverPresence.userId });
    return { reminded, offline: offline.length };
  }

  /** Records the reminder; false if it was already sent. */
  private async firstNotice(subject: string, expiresOn: string, expired: boolean) {
    const inserted = await this.database.db
      .insert(documentExpiryNotices)
      .values({ subject, expiresOn, stage: expired ? 'expired' : 'soon' })
      .onConflictDoNothing()
      .returning({ subject: documentExpiryNotices.subject });
    return inserted.length > 0;
  }
}
