import { createHash, randomUUID } from 'node:crypto';
import type { Readable } from 'node:stream';
import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import { assertNotGuest } from '../identity/guest.service.js';
import {
  DOCUMENT_EXPIRY_NOTICE_DAYS,
  RENEWABLE_DOCUMENT_KINDS,
  isRenewableDocument,
  requiredDocuments,
  todayInVenezuela,
  type ApplicationDocument,
  type DocumentRenewal,
  type DocumentRenewalForReview,
  type RenewableDocumentKind,
  type ReviewDocumentRenewalRequest,
  type ApplicationInput,
  type DocumentKind,
  type OnDemandMode,
  type ProviderApplication,
  type ReviewApplicationRequest,
} from '@vtp/shared-types';
import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import { ApiException } from '../../common/errors/api.exception.js';
import { AppConfigService } from '../../config/app-config.service.js';
import { DatabaseService, type Transaction } from '../../database/database.service.js';
import { EXTENSION_FOR, detectDocumentType } from '../../storage/file-type.js';
import { FILE_STORAGE, type FileStorage } from '../../storage/file-storage.js';
import { AuditService } from '../audit/audit.service.js';
import type { Authenticated, RequestMeta } from '../identity/sessions.service.js';
import { UsersService } from '../identity/users.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { vehicleDocuments, vehicles } from '../fleet/fleet.schema.js';
import {
  memberships,
  organizations,
  type OrganizationRow,
} from '../organizations/organizations.schema.js';
import { OrganizationsService } from '../organizations/organizations.service.js';
import {
  applicationDocuments,
  applications,
  documentRenewals,
  type ApplicationDocumentRow,
  type ApplicationRow,
  type DocumentRenewalRow,
} from './onboarding.schema.js';
import { ageOn, normalizeDocumentNumber, normalizePlate, sanitizeFileName } from './validation.js';

const EDITABLE = ['draft', 'changes_requested'] as const;
const OPEN = ['draft', 'submitted', 'changes_requested'] as const;

export interface UploadedFile {
  buffer: Buffer;
  originalname: string;
  size: number;
}

export interface DocumentDownload {
  stream: Readable;
  contentType: string;
  fileName: string;
}

const badRequest = (message: string) =>
  new ApiException('VALIDATION_FAILED', message, HttpStatus.BAD_REQUEST);
const notFound = (message = 'Application not found') =>
  new ApiException('NOT_FOUND', message, HttpStatus.NOT_FOUND);

@Injectable()
export class OnboardingService {
  private readonly logger = new Logger(OnboardingService.name);

  constructor(
    private readonly database: DatabaseService,
    private readonly organizations: OrganizationsService,
    private readonly users: UsersService,
    private readonly audit: AuditService,
    private readonly config: AppConfigService,
    @Inject(FILE_STORAGE) private readonly storage: FileStorage,
    private readonly notifications: NotificationsService,
  ) {}

  // ── Applicant ───────────────────────────────────────────────────────────

  /** The open application, or else the most recent finished one. */
  async current(userId: string): Promise<ProviderApplication> {
    const rows = await this.database.db
      .select()
      .from(applications)
      .where(eq(applications.userId, userId))
      .orderBy(desc(applications.createdAt))
      .limit(20);
    const row = rows.find((r) => (OPEN as readonly string[]).includes(r.status)) ?? rows[0];
    if (!row) throw notFound('You have not started an application');
    return this.toDto(row);
  }

  async create(
    auth: Authenticated,
    input: ApplicationInput,
    meta: RequestMeta,
  ): Promise<ProviderApplication> {
    assertNotGuest(auth);
    const values = await this.validated(input);
    const [row] = await this.database.db
      .insert(applications)
      .values({ ...values, userId: auth.user.id })
      .onConflictDoNothing()
      .returning();
    if (!row)
      throw ApiException.conflict('You already have an open application', 'APPLICATION_OPEN');
    await this.audit.record({
      action: 'application.created',
      actorUserId: auth.user.id,
      targetType: 'application',
      targetId: row.id,
      ip: meta.ip,
    });
    return this.toDto(row);
  }

  async update(
    auth: Authenticated,
    input: Partial<ApplicationInput>,
    meta: RequestMeta,
  ): Promise<ProviderApplication> {
    const current = await this.requireEditable(auth.user.id);
    const values = await this.validated({
      ...(await this.toInput(current)),
      ...input,
    } as ApplicationInput);
    const [row] = await this.database.db
      .update(applications)
      .set(values)
      .where(eq(applications.id, current.id))
      .returning();
    await this.audit.record({
      action: 'application.updated',
      actorUserId: auth.user.id,
      targetType: 'application',
      targetId: current.id,
      ip: meta.ip,
    });
    return this.toDto(row!);
  }

  /** Stores (or replaces) one document. Only kinds required for the application are accepted. */
  async upload(
    auth: Authenticated,
    kind: DocumentKind,
    file: UploadedFile | undefined,
    expiresOn: string | undefined,
    meta: RequestMeta,
  ): Promise<ProviderApplication> {
    const application = await this.requireEditable(auth.user.id);
    if (!requiredDocuments(application.desiredRole, application.providesVehicle).includes(kind)) {
      throw badRequest('This document is not required for your application');
    }
    const contentType = this.checkedFile(file);
    if (expiresOn !== undefined && expiresOn <= this.today())
      throw badRequest('The document has already expired');

    const storageKey = `kyc/${application.id}/${randomUUID()}.${EXTENSION_FOR[contentType]}`;
    await this.storage.put(storageKey, file!.buffer, contentType);

    const [previous] = await this.database.db
      .select({ storageKey: applicationDocuments.storageKey })
      .from(applicationDocuments)
      .where(
        and(
          eq(applicationDocuments.applicationId, application.id),
          eq(applicationDocuments.kind, kind),
        ),
      )
      .limit(1);
    const values = {
      storageKey,
      fileName: sanitizeFileName(file!.originalname),
      contentType,
      sizeBytes: file!.size,
      sha256: createHash('sha256').update(file!.buffer).digest('hex'),
      expiresOn: expiresOn ?? null,
      status: 'pending' as const,
      rejectionReason: null,
      uploadedAt: new Date(),
    };
    try {
      await this.database.db
        .insert(applicationDocuments)
        .values({ applicationId: application.id, kind, ...values })
        .onConflictDoUpdate({
          target: [applicationDocuments.applicationId, applicationDocuments.kind],
          set: values,
        });
    } catch (error) {
      await this.storage.delete(storageKey);
      throw error;
    }
    if (previous) await this.deleteQuietly(previous.storageKey);
    await this.audit.record({
      action: 'application.document_uploaded',
      actorUserId: auth.user.id,
      targetType: 'application',
      targetId: application.id,
      ip: meta.ip,
      metadata: { kind },
    });
    return this.toDto(application);
  }

  async submit(auth: Authenticated, meta: RequestMeta): Promise<ProviderApplication> {
    const application = await this.requireEditable(auth.user.id);
    const dto = await this.toDto(application);
    if (dto.missingDocuments.length > 0) {
      throw badRequest(`Upload the missing documents first: ${dto.missingDocuments.join(', ')}`);
    }
    if (dto.documents.some((d) => d.expiresOn !== null && d.expiresOn <= this.today())) {
      throw badRequest('One of your documents has expired, upload a current one');
    }
    if (dto.documents.some((d) => d.status === 'rejected')) {
      throw badRequest('Replace the rejected documents before submitting');
    }
    const [row] = await this.database.db
      .update(applications)
      .set({ status: 'submitted', submittedAt: new Date() })
      .where(and(eq(applications.id, application.id), inArray(applications.status, [...EDITABLE])))
      .returning();
    if (!row)
      throw ApiException.conflict('The application changed, reload and retry', 'RELOAD_AND_RETRY');
    await this.audit.record({
      action: 'application.submitted',
      actorUserId: auth.user.id,
      targetType: 'application',
      targetId: row.id,
      ip: meta.ip,
    });
    return this.toDto(row);
  }

  async downloadOwn(auth: Authenticated, documentId: string): Promise<DocumentDownload> {
    const [row] = await this.database.db
      .select({ document: applicationDocuments })
      .from(applicationDocuments)
      .innerJoin(applications, eq(applications.id, applicationDocuments.applicationId))
      .where(and(eq(applicationDocuments.id, documentId), eq(applications.userId, auth.user.id)))
      .limit(1);
    if (!row) throw notFound('Document not found');
    return this.download(row.document);
  }

  // ── Renewals (ADR-042) ──────────────────────────────────────────────────

  /**
   * An approved driver uploads a new copy of a document that expires. It waits for platform
   * review; uploading again replaces the pending one.
   */
  async renew(
    auth: Authenticated,
    kind: DocumentKind,
    file: UploadedFile | undefined,
    expiresOn: string | undefined,
    meta: RequestMeta,
  ): Promise<ProviderApplication> {
    const application = await this.requireApproved(auth.user.id);
    if (
      !isRenewableDocument(kind) ||
      !requiredDocuments(application.desiredRole, application.providesVehicle).includes(kind)
    ) {
      throw badRequest('This document is not renewed here');
    }
    const contentType = this.checkedFile(file);
    if (!expiresOn) throw badRequest('Enter the expiry date of the new copy');
    if (expiresOn <= this.today()) throw badRequest('The document has already expired');

    const storageKey = `kyc/${application.id}/${randomUUID()}.${EXTENSION_FOR[contentType]}`;
    await this.storage.put(storageKey, file!.buffer, contentType);
    const values = {
      storageKey,
      fileName: sanitizeFileName(file!.originalname),
      contentType,
      sizeBytes: file!.size,
      sha256: createHash('sha256').update(file!.buffer).digest('hex'),
      expiresOn,
      uploadedAt: new Date(),
    };
    let replaced: string | null;
    try {
      replaced = await this.database.db.transaction(async (tx) => {
        const [pending] = await tx
          .select()
          .from(documentRenewals)
          .where(
            and(
              eq(documentRenewals.applicationId, application.id),
              eq(documentRenewals.kind, kind),
              eq(documentRenewals.status, 'pending'),
            ),
          )
          .for('update')
          .limit(1);
        if (pending) {
          await tx.update(documentRenewals).set(values).where(eq(documentRenewals.id, pending.id));
          return pending.storageKey;
        }
        await tx
          .insert(documentRenewals)
          .values({ applicationId: application.id, kind, ...values });
        return null;
      });
    } catch (error) {
      await this.storage.delete(storageKey);
      throw error;
    }
    if (replaced) await this.deleteQuietly(replaced);
    await this.audit.record({
      action: 'application.document_renewed',
      actorUserId: auth.user.id,
      targetType: 'application',
      targetId: application.id,
      ip: meta.ip,
      metadata: { kind },
    });
    return this.toDto(application);
  }

  /** Pending renewals, oldest first, for platform reviewers. */
  async listRenewals(): Promise<DocumentRenewalForReview[]> {
    const rows = await this.database.db
      .select({ renewal: documentRenewals, application: applications })
      .from(documentRenewals)
      .innerJoin(applications, eq(applications.id, documentRenewals.applicationId))
      .where(eq(documentRenewals.status, 'pending'))
      .orderBy(asc(documentRenewals.uploadedAt))
      .limit(100);
    const current = rows.length
      ? await this.database.db
          .select({
            applicationId: applicationDocuments.applicationId,
            kind: applicationDocuments.kind,
            expiresOn: applicationDocuments.expiresOn,
          })
          .from(applicationDocuments)
          .where(
            inArray(
              applicationDocuments.applicationId,
              rows.map((r) => r.application.id),
            ),
          )
      : [];
    return rows.map(({ renewal, application }) => ({
      ...toRenewal(renewal),
      applicationId: application.id,
      firstName: application.firstName,
      lastName: application.lastName,
      currentExpiresOn:
        current.find((d) => d.applicationId === application.id && d.kind === renewal.kind)
          ?.expiresOn ?? null,
    }));
  }

  /** Every reviewer access to a document is audited, as with the application's. */
  async downloadRenewal(
    reviewer: Authenticated,
    renewalId: string,
    meta: RequestMeta,
  ): Promise<DocumentDownload> {
    const renewal = await this.requireRenewal(renewalId);
    if (!renewal.storageKey) throw notFound('The file was already reviewed');
    await this.audit.record({
      action: 'application.document_viewed',
      actorUserId: reviewer.user.id,
      targetType: 'application',
      targetId: renewal.applicationId,
      ip: meta.ip,
      metadata: { kind: renewal.kind, renewal: true },
    });
    return {
      stream: await this.storage.read(renewal.storageKey),
      contentType: renewal.contentType,
      fileName: renewal.fileName,
    };
  }

  /**
   * Accepting puts the new copy in place of the current one: the licence and the medical
   * certificate in all of the driver's approved applications, the RCV policy also as the insurance
   * of the vehicle. Rejecting deletes the file and tells the driver why.
   */
  async reviewRenewal(
    reviewer: Authenticated,
    renewalId: string,
    input: ReviewDocumentRenewalRequest,
    meta: RequestMeta,
  ): Promise<DocumentRenewal> {
    const reason = input.reason?.trim() || null;
    if (input.decision === 'reject' && !reason) throw badRequest('Explain why in reason');
    const oldKeys: string[] = [];
    const { row, userId } = await this.database.db.transaction(async (tx) => {
      const [renewal] = await tx
        .select()
        .from(documentRenewals)
        .where(eq(documentRenewals.id, renewalId))
        .for('update')
        .limit(1);
      if (!renewal) throw notFound('Renewal not found');
      if (renewal.status !== 'pending' || !renewal.storageKey) {
        throw ApiException.conflict('This renewal was already reviewed', 'RELOAD_AND_RETRY');
      }
      const [application] = await tx
        .select()
        .from(applications)
        .where(eq(applications.id, renewal.applicationId))
        .limit(1);
      if (input.decision === 'reject') {
        oldKeys.push(renewal.storageKey);
      } else {
        const personal = renewal.kind !== 'liability_insurance';
        const targets = personal
          ? (
              await tx
                .select({ id: applications.id })
                .from(applications)
                .where(
                  and(
                    eq(applications.userId, application!.userId),
                    eq(applications.status, 'approved'),
                  ),
                )
            ).map((a) => a.id)
          : [renewal.applicationId];
        const documents = await tx
          .select()
          .from(applicationDocuments)
          .where(
            and(
              inArray(applicationDocuments.applicationId, targets),
              eq(applicationDocuments.kind, renewal.kind),
            ),
          );
        // The new file belongs to one application; the others get a copy of their own.
        for (const document of documents) {
          let storageKey = renewal.storageKey;
          if (document.applicationId !== renewal.applicationId) {
            storageKey = `kyc/${document.applicationId}/${randomUUID()}.${EXTENSION_FOR[renewal.contentType]}`;
            await this.storage.put(
              storageKey,
              await streamToBuffer(await this.storage.read(renewal.storageKey)),
              renewal.contentType,
            );
          }
          oldKeys.push(document.storageKey);
          await tx
            .update(applicationDocuments)
            .set({
              storageKey,
              fileName: renewal.fileName,
              contentType: renewal.contentType,
              sizeBytes: renewal.sizeBytes,
              sha256: renewal.sha256,
              expiresOn: renewal.expiresOn,
              status: 'accepted',
              rejectionReason: null,
              uploadedAt: renewal.uploadedAt,
            })
            .where(eq(applicationDocuments.id, document.id));
        }
        if (renewal.kind === 'liability_insurance' && application?.vehicle) {
          const owned = await tx
            .select({ id: vehicles.id })
            .from(vehicles)
            .where(
              and(
                eq(vehicles.ownerUserId, application.userId),
                eq(vehicles.plate, application.vehicle.plate),
              ),
            );
          for (const vehicle of owned) {
            await tx
              .insert(vehicleDocuments)
              .values({
                vehicleId: vehicle.id,
                kind: 'insurance',
                number: 'RCV verificada en el KYC',
                expiresOn: renewal.expiresOn,
              })
              .onConflictDoUpdate({
                target: [vehicleDocuments.vehicleId, vehicleDocuments.kind],
                set: { expiresOn: renewal.expiresOn, number: 'RCV verificada en el KYC' },
              });
          }
        }
      }
      const [updated] = await tx
        .update(documentRenewals)
        .set({
          status: input.decision === 'accept' ? 'accepted' : 'rejected',
          rejectionReason: input.decision === 'reject' ? reason : null,
          // Accepted: the file now belongs to the application document.
          storageKey: null,
          reviewedBy: reviewer.user.id,
          reviewedAt: new Date(),
        })
        .where(eq(documentRenewals.id, renewalId))
        .returning();
      return { row: updated!, userId: application!.userId };
    });
    for (const key of oldKeys) await this.deleteQuietly(key);
    await this.audit.record({
      action: `application.renewal_${input.decision === 'accept' ? 'accepted' : 'rejected'}`,
      actorUserId: reviewer.user.id,
      targetType: 'application',
      targetId: row.applicationId,
      ip: meta.ip,
      metadata: { kind: row.kind },
    });
    const kind = row.kind as RenewableDocumentKind;
    this.notifications.send({
      kind: 'document_renewal_reviewed',
      userIds: [userId],
      app: 'transport',
      email: true,
      text: (m) => m.documentRenewalReviewed(kind, input.decision === 'accept', reason),
      reference: { key: 'applicationId', id: row.applicationId },
    });
    return toRenewal(row);
  }

  // ── Platform reviewers ──────────────────────────────────────────────────

  async listForReview(status: ApplicationRow['status']): Promise<ProviderApplication[]> {
    const rows = await this.database.db
      .select()
      .from(applications)
      .where(eq(applications.status, status))
      // Submitted ones, the oldest first; drafts (never submitted), the newest first.
      .orderBy(applications.submittedAt, desc(applications.createdAt))
      .limit(100);
    return Promise.all(rows.map((row) => this.toDto(row)));
  }

  async getForReview(applicationId: string): Promise<ProviderApplication> {
    return this.toDto(await this.requireApplication(applicationId));
  }

  /** Every reviewer access to a document is audited: they contain personal data. */
  async downloadForReview(
    reviewer: Authenticated,
    applicationId: string,
    documentId: string,
    meta: RequestMeta,
  ): Promise<DocumentDownload> {
    const [document] = await this.database.db
      .select()
      .from(applicationDocuments)
      .where(
        and(
          eq(applicationDocuments.id, documentId),
          eq(applicationDocuments.applicationId, applicationId),
        ),
      )
      .limit(1);
    if (!document) throw notFound('Document not found');
    await this.audit.record({
      action: 'application.document_viewed',
      actorUserId: reviewer.user.id,
      targetType: 'application',
      targetId: applicationId,
      ip: meta.ip,
      metadata: { kind: document.kind },
    });
    return this.download(document);
  }

  async review(
    reviewer: Authenticated,
    applicationId: string,
    input: ReviewApplicationRequest,
    meta: RequestMeta,
  ): Promise<ProviderApplication> {
    const notes = input.notes?.trim() || null;
    if (input.decision !== 'approve' && !notes) throw badRequest('Explain the decision in notes');

    const row = await this.database.db.transaction(async (tx) => {
      const [application] = await tx
        .select()
        .from(applications)
        .where(eq(applications.id, applicationId))
        .for('update')
        .limit(1);
      if (!application) throw notFound();
      if (application.status !== 'submitted') {
        throw ApiException.conflict(
          `Cannot review an application that is ${application.status}`,
          'APPLICATION_WRONG_STATUS',
        );
      }

      for (const verdict of input.documents ?? []) {
        const [updated] = await tx
          .update(applicationDocuments)
          .set({
            status: verdict.status,
            rejectionReason:
              verdict.status === 'rejected' ? verdict.reason?.trim() || 'Not valid' : null,
          })
          .where(
            and(
              eq(applicationDocuments.id, verdict.documentId),
              eq(applicationDocuments.applicationId, applicationId),
            ),
          )
          .returning({ id: applicationDocuments.id });
        if (!updated)
          throw badRequest(`Document ${verdict.documentId} does not belong to this application`);
      }

      if (input.decision === 'approve') {
        const documents = await tx
          .select()
          .from(applicationDocuments)
          .where(eq(applicationDocuments.applicationId, applicationId));
        const required = requiredDocuments(application.desiredRole, application.providesVehicle);
        const accepted = new Set(
          documents.filter((d) => d.status === 'accepted').map((d) => d.kind),
        );
        if (!required.every((kind) => accepted.has(kind))) {
          throw badRequest('Accept every required document before approving');
        }
      }

      const status =
        input.decision === 'approve'
          ? 'approved'
          : input.decision === 'reject'
            ? 'rejected'
            : 'changes_requested';
      // An independent driver approved for a line the platform runs joins it at once, with their
      // vehicle in its fleet marked as theirs (ADR-039): the platform already reviewed them.
      const independentLine =
        status === 'approved' && application.organizationId
          ? await this.organizations.findById(application.organizationId)
          : undefined;
      const joinsNow = !!independentLine?.operatedByPlatform && independentLine.status === 'active';
      if (joinsNow) {
        await this.joinIndependentLine(tx, independentLine!, application);
      }
      const [updated] = await tx
        .update(applications)
        .set({
          status,
          reviewNotes: notes,
          reviewedBy: reviewer.user.id,
          reviewedAt: new Date(),
          organizationDecision:
            status === 'approved' && application.organizationId
              ? joinsNow
                ? 'accepted'
                : 'pending'
              : null,
        })
        .where(eq(applications.id, applicationId))
        .returning();
      return updated!;
    });

    if (row.status === 'approved') {
      await this.users.markIdentityVerified(row.userId, {
        firstName: row.firstName,
        lastName: row.lastName,
      });
    }
    await this.audit.record({
      action: `application.${row.status === 'changes_requested' ? 'changes_requested' : row.status}`,
      actorUserId: reviewer.user.id,
      targetType: 'application',
      targetId: applicationId,
      ip: meta.ip,
    });
    this.notifications.send({
      kind: 'application_reviewed',
      userIds: [row.userId],
      app: 'transport',
      email: true,
      text: (m) =>
        m.applicationReviewed(row.status as 'approved' | 'rejected' | 'changes_requested', notes),
      reference: { key: 'applicationId', id: applicationId },
    });
    return this.toDto(row);
  }

  /**
   * Adds an approved independent driver to a line the platform runs, with their own vehicle
   * (ADR-039). A vehicle with that plate already in the line must be theirs (a second approval
   * after leaving the line); someone else's is a conflict for the reviewer to sort out.
   */
  private async joinIndependentLine(
    tx: Transaction,
    line: OrganizationRow,
    application: ApplicationRow,
  ): Promise<void> {
    if (application.desiredRole !== 'driver' || !application.vehicle) {
      throw ApiException.conflict(
        'Independent drivers must register their own vehicle',
        'INDEPENDENT_NEEDS_VEHICLE',
      );
    }
    const [member] = await tx
      .select({ userId: memberships.userId })
      .from(memberships)
      .where(
        and(eq(memberships.organizationId, line.id), eq(memberships.userId, application.userId)),
      )
      .limit(1);
    if (!member) {
      await this.organizations.addMember(tx, line.id, application.userId, 'driver');
    }
    const { plate, make, model, year, color } = application.vehicle;
    const [existing] = await tx
      .select()
      .from(vehicles)
      .where(and(eq(vehicles.organizationId, line.id), eq(vehicles.plate, plate)))
      .limit(1);
    if (existing && existing.ownerUserId !== application.userId) {
      throw ApiException.conflict(
        'Another vehicle with this plate is already in the line',
        'VEHICLE_PLATE_TAKEN',
      );
    }
    let vehicleId = existing?.id;
    if (existing) {
      await tx.update(vehicles).set({ active: true }).where(eq(vehicles.id, existing.id));
    } else {
      const [created] = await tx
        .insert(vehicles)
        .values({
          organizationId: line.id,
          plate,
          label: `${make} ${model} ${year} · ${color}`,
          mode: line.type === 'moto_line' ? 'motorcycle' : 'car',
          ownerUserId: application.userId,
        })
        .returning({ id: vehicles.id });
      vehicleId = created!.id;
    }
    // The reviewed RCV policy becomes the vehicle's insurance: rides stop when it expires.
    const [policy] = await tx
      .select({ expiresOn: applicationDocuments.expiresOn })
      .from(applicationDocuments)
      .where(
        and(
          eq(applicationDocuments.applicationId, application.id),
          eq(applicationDocuments.kind, 'liability_insurance'),
        ),
      );
    if (policy?.expiresOn) {
      await tx
        .insert(vehicleDocuments)
        .values({
          vehicleId: vehicleId!,
          kind: 'insurance',
          number: 'RCV verificada en el KYC',
          expiresOn: policy.expiresOn,
        })
        .onConflictDoUpdate({
          target: [vehicleDocuments.vehicleId, vehicleDocuments.kind],
          set: { expiresOn: policy.expiresOn, number: 'RCV verificada en el KYC' },
        });
    }
  }

  // ── Internals ───────────────────────────────────────────────────────────

  private async validated(input: ApplicationInput) {
    const documentNumber = normalizeDocumentNumber(input.documentType, input.documentNumber);
    if (!documentNumber) throw badRequest('Enter a valid identity document number');
    const age = ageOn(input.birthDate);
    if (Number.isNaN(age) || age < 18 || age > 100)
      throw badRequest('Applicants must be at least 18 years old');

    // Only independent drivers apply (ADR-039): staff of a company or line join by its invitation.
    const line = await this.independentLine(input.mode);
    if (!input.vehicle) {
      throw ApiException.conflict(
        'Independent drivers must register their own vehicle',
        'INDEPENDENT_NEEDS_VEHICLE',
      );
    }
    const plate = normalizePlate(input.vehicle.plate);
    if (!plate) throw badRequest('Enter a valid plate');
    const vehicle = {
      plate,
      make: input.vehicle.make.trim(),
      model: input.vehicle.model.trim(),
      year: input.vehicle.year,
      color: input.vehicle.color.trim(),
    };

    return {
      desiredRole: 'driver' as const,
      organizationId: line.id,
      firstName: input.firstName.trim(),
      lastName: input.lastName.trim(),
      documentType: input.documentType,
      documentNumber,
      birthDate: input.birthDate,
      state: input.state?.trim() || null,
      city: input.city?.trim() || null,
      providesVehicle: true,
      vehicle,
    };
  }

  /**
   * The platform's active line for independent drivers of this vehicle (ADR-039), the oldest if
   * there are several. The driver never chooses it nor sees it: they "drive with VTP".
   */
  private async independentLine(mode: OnDemandMode): Promise<OrganizationRow> {
    const [line] = await this.database.db
      .select()
      .from(organizations)
      .where(
        and(
          eq(organizations.operatedByPlatform, true),
          eq(organizations.status, 'active'),
          eq(organizations.type, mode === 'motorcycle' ? 'moto_line' : 'taxi_line'),
        ),
      )
      .orderBy(asc(organizations.createdAt))
      .limit(1);
    if (!line) {
      throw ApiException.conflict(
        'The platform is not taking independent drivers with this vehicle yet',
        'INDEPENDENTS_NOT_AVAILABLE',
      );
    }
    return line;
  }

  /** The stored application as input, to merge a partial update into. */
  private async toInput(row: ApplicationRow): Promise<Partial<ApplicationInput>> {
    const line = row.organizationId ? await this.organizations.findById(row.organizationId) : null;
    const mode = line ? modeOf(line.type) : null;
    return {
      ...(mode ? { mode } : {}),
      firstName: row.firstName,
      lastName: row.lastName,
      documentType: row.documentType,
      documentNumber: row.documentNumber,
      birthDate: row.birthDate,
      state: row.state ?? undefined,
      city: row.city ?? undefined,
      ...(row.vehicle ? { vehicle: row.vehicle } : {}),
    };
  }

  private async requireEditable(userId: string): Promise<ApplicationRow> {
    const [row] = await this.database.db
      .select()
      .from(applications)
      .where(and(eq(applications.userId, userId), inArray(applications.status, [...OPEN])))
      .limit(1);
    if (!row) throw notFound('You have no open application');
    if (!(EDITABLE as readonly string[]).includes(row.status)) {
      throw ApiException.conflict(
        'The application is under review and cannot be changed',
        'APPLICATION_UNDER_REVIEW',
      );
    }
    return row;
  }

  /** The driver's latest approved application, where renewals go. */
  private async requireApproved(userId: string): Promise<ApplicationRow> {
    const [row] = await this.database.db
      .select()
      .from(applications)
      .where(and(eq(applications.userId, userId), eq(applications.status, 'approved')))
      .orderBy(desc(applications.reviewedAt))
      .limit(1);
    if (!row) {
      throw ApiException.conflict(
        'Only approved drivers renew documents',
        'APPLICATION_WRONG_STATUS',
      );
    }
    return row;
  }

  private async requireRenewal(id: string): Promise<DocumentRenewalRow> {
    const [row] = await this.database.db
      .select()
      .from(documentRenewals)
      .where(eq(documentRenewals.id, id))
      .limit(1);
    if (!row) throw notFound('Renewal not found');
    return row;
  }

  /** Size and type, checked by content. Returns the detected type. */
  private checkedFile(file: UploadedFile | undefined) {
    if (!file || file.size === 0) throw badRequest('Attach a file in the "file" field');
    if (file.size > this.config.get('FILE_UPLOAD_MAX_BYTES')) {
      throw new ApiException(
        'PAYLOAD_TOO_LARGE',
        'The file is too large',
        HttpStatus.PAYLOAD_TOO_LARGE,
      );
    }
    const contentType = detectDocumentType(file.buffer);
    if (!contentType) throw badRequest('Upload a JPG, PNG or PDF file');
    return contentType;
  }

  private async requireApplication(id: string): Promise<ApplicationRow> {
    const [row] = await this.database.db
      .select()
      .from(applications)
      .where(eq(applications.id, id))
      .limit(1);
    if (!row) throw notFound();
    return row;
  }

  private async download(document: ApplicationDocumentRow): Promise<DocumentDownload> {
    return {
      stream: await this.storage.read(document.storageKey),
      contentType: document.contentType,
      fileName: document.fileName,
    };
  }

  private async deleteQuietly(key: string): Promise<void> {
    try {
      await this.storage.delete(key);
    } catch (error) {
      this.logger.warn(`Could not delete replaced file ${key}: ${(error as Error).message}`);
    }
  }

  private today(): string {
    return new Date().toISOString().slice(0, 10);
  }

  private async toDto(row: ApplicationRow): Promise<ProviderApplication> {
    const documents = await this.database.db
      .select()
      .from(applicationDocuments)
      .where(eq(applicationDocuments.applicationId, row.id));
    const organization = row.organizationId
      ? await this.organizations.findById(row.organizationId)
      : undefined;
    const uploaded = new Set(documents.map((d) => d.kind));
    const renewals = await this.database.db
      .select()
      .from(documentRenewals)
      .where(eq(documentRenewals.applicationId, row.id))
      .orderBy(desc(documentRenewals.uploadedAt));
    const today = todayInVenezuela();
    const soon = addDays(today, DOCUMENT_EXPIRY_NOTICE_DAYS);
    return {
      id: row.id,
      userId: row.userId,
      status: row.status,
      desiredRole: row.desiredRole,
      organization: organization
        ? { id: organization.id, type: organization.type, legalName: organization.legalName }
        : null,
      mode: organization ? modeOf(organization.type) : null,
      organizationDecision: row.organizationDecision,
      firstName: row.firstName,
      lastName: row.lastName,
      documentType: row.documentType,
      documentNumber: row.documentNumber,
      birthDate: row.birthDate,
      state: row.state,
      city: row.city,
      providesVehicle: row.providesVehicle,
      vehicle: row.vehicle,
      documents: documents.map((d): ApplicationDocument => ({
        id: d.id,
        kind: d.kind,
        fileName: d.fileName,
        contentType: d.contentType,
        sizeBytes: d.sizeBytes,
        expiresOn: d.expiresOn,
        status: d.status,
        rejectionReason: d.rejectionReason,
        uploadedAt: d.uploadedAt.toISOString(),
      })),
      missingDocuments: requiredDocuments(row.desiredRole, row.providesVehicle).filter(
        (k) => !uploaded.has(k),
      ),
      expiring:
        row.status === 'approved'
          ? documents.flatMap((d) =>
              isRenewableDocument(d.kind) && d.expiresOn !== null && d.expiresOn <= soon
                ? [{ kind: d.kind, expiresOn: d.expiresOn, expired: d.expiresOn < today }]
                : [],
            )
          : [],
      // The newest of each kind, unless it was accepted (then it is the current document).
      renewals: RENEWABLE_DOCUMENT_KINDS.flatMap((kind) => {
        const latest = renewals.find((r) => r.kind === kind);
        return latest && latest.status !== 'accepted' ? [toRenewal(latest)] : [];
      }),
      reviewNotes: row.reviewNotes,
      submittedAt: row.submittedAt?.toISOString() ?? null,
      reviewedAt: row.reviewedAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
    };
  }
}

/** The vehicle of a platform line for independents: motorcycles or cars (taxis). */
function modeOf(type: OrganizationRow['type']): OnDemandMode | null {
  return type === 'moto_line' ? 'motorcycle' : type === 'taxi_line' ? 'car' : null;
}

function toRenewal(row: DocumentRenewalRow): DocumentRenewal {
  return {
    id: row.id,
    kind: row.kind as RenewableDocumentKind,
    fileName: row.fileName,
    contentType: row.contentType,
    sizeBytes: row.sizeBytes,
    expiresOn: row.expiresOn,
    status: row.status,
    rejectionReason: row.rejectionReason,
    uploadedAt: row.uploadedAt.toISOString(),
    reviewedAt: row.reviewedAt?.toISOString() ?? null,
  };
}

/** `YYYY-MM-DD` plus some days. */
function addDays(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

async function streamToBuffer(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk as Uint8Array));
  return Buffer.concat(chunks);
}
