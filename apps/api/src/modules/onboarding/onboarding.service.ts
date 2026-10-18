import { createHash, randomUUID } from 'node:crypto';
import type { Readable } from 'node:stream';
import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import {
  requiredDocuments,
  roleAllowedFor,
  type ApplicationDocument,
  type ApplicationInput,
  type DocumentKind,
  type OrganizationApplicant,
  type ProviderApplication,
  type ReviewApplicationRequest,
} from '@vtp/shared-types';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { ApiException } from '../../common/errors/api.exception.js';
import { AppConfigService } from '../../config/app-config.service.js';
import { DatabaseService } from '../../database/database.service.js';
import { EXTENSION_FOR, detectDocumentType } from '../../storage/file-type.js';
import { FILE_STORAGE, type FileStorage } from '../../storage/file-storage.js';
import { AuditService } from '../audit/audit.service.js';
import type { Authenticated, RequestMeta } from '../identity/sessions.service.js';
import { UsersService } from '../identity/users.service.js';
import type { OrganizationAccess } from '../organizations/organization-access.js';
import type { OrganizationRow } from '../organizations/organizations.schema.js';
import { OrganizationsService } from '../organizations/organizations.service.js';
import {
  applicationDocuments,
  applications,
  type ApplicationDocumentRow,
  type ApplicationRow,
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
    const values = await this.validated(input);
    const [row] = await this.database.db
      .insert(applications)
      .values({ ...values, userId: auth.user.id })
      .onConflictDoNothing()
      .returning();
    if (!row)
      throw new ApiException(
        'CONFLICT',
        'You already have an open application',
        HttpStatus.CONFLICT,
      );
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
    const values = await this.validated({ ...this.toInput(current), ...input });
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
    if (expiresOn !== undefined && expiresOn <= this.today())
      throw badRequest('The document has already expired');

    const storageKey = `kyc/${application.id}/${randomUUID()}.${EXTENSION_FOR[contentType]}`;
    await this.storage.put(storageKey, file.buffer, contentType);

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
      fileName: sanitizeFileName(file.originalname),
      contentType,
      sizeBytes: file.size,
      sha256: createHash('sha256').update(file.buffer).digest('hex'),
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
      throw new ApiException(
        'CONFLICT',
        'The application changed, reload and retry',
        HttpStatus.CONFLICT,
      );
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

  // ── Platform reviewers ──────────────────────────────────────────────────

  async listForReview(status: ApplicationRow['status']): Promise<ProviderApplication[]> {
    const rows = await this.database.db
      .select()
      .from(applications)
      .where(eq(applications.status, status))
      .orderBy(applications.submittedAt)
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
        throw new ApiException(
          'CONFLICT',
          `Cannot review an application that is ${application.status}`,
          HttpStatus.CONFLICT,
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
      const [updated] = await tx
        .update(applications)
        .set({
          status,
          reviewNotes: notes,
          reviewedBy: reviewer.user.id,
          reviewedAt: new Date(),
          organizationDecision:
            status === 'approved' && application.organizationId ? 'pending' : null,
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
    return this.toDto(row);
  }

  // ── Target organization ─────────────────────────────────────────────────

  async applicantsFor(organizationId: string): Promise<OrganizationApplicant[]> {
    const rows = await this.database.db
      .select()
      .from(applications)
      .where(
        and(eq(applications.organizationId, organizationId), eq(applications.status, 'approved')),
      )
      .orderBy(desc(applications.reviewedAt))
      .limit(200);
    return rows.map((row) => ({
      applicationId: row.id,
      userId: row.userId,
      firstName: row.firstName,
      lastName: row.lastName,
      desiredRole: row.desiredRole,
      state: row.state,
      city: row.city,
      providesVehicle: row.providesVehicle,
      vehicle: row.vehicle,
      decision: row.organizationDecision ?? 'pending',
      approvedAt: (row.reviewedAt ?? row.updatedAt).toISOString(),
    }));
  }

  /** The organization accepts (adding the person with the requested role) or declines an approved applicant. */
  async decide(
    access: OrganizationAccess,
    applicationId: string,
    decision: 'accept' | 'decline',
    actor: Authenticated,
    meta: RequestMeta,
  ): Promise<void> {
    const { organization } = access;
    await this.database.db.transaction(async (tx) => {
      const [application] = await tx
        .select()
        .from(applications)
        .where(
          and(
            eq(applications.id, applicationId),
            eq(applications.organizationId, organization.id),
            eq(applications.status, 'approved'),
            eq(applications.organizationDecision, 'pending'),
          ),
        )
        .for('update')
        .limit(1);
      if (!application) throw notFound('Applicant not found');
      if (decision === 'accept') {
        this.organizations.assertRoleAllowed(organization, application.desiredRole);
        await this.organizations.addMember(
          tx,
          organization.id,
          application.userId,
          application.desiredRole,
        );
      }
      await tx
        .update(applications)
        .set({ organizationDecision: decision === 'accept' ? 'accepted' : 'declined' })
        .where(eq(applications.id, applicationId));
    });
    await this.audit.record({
      action:
        decision === 'accept'
          ? 'application.organization_accepted'
          : 'application.organization_declined',
      actorUserId: actor.user.id,
      targetType: 'application',
      targetId: applicationId,
      ip: meta.ip,
      metadata: { organizationId: organization.id },
    });
  }

  // ── Internals ───────────────────────────────────────────────────────────

  private async validated(input: ApplicationInput) {
    const documentNumber = normalizeDocumentNumber(input.documentType, input.documentNumber);
    if (!documentNumber) throw badRequest('Enter a valid identity document number');
    const age = ageOn(input.birthDate);
    if (Number.isNaN(age) || age < 18 || age > 100)
      throw badRequest('Applicants must be at least 18 years old');

    let organization: OrganizationRow | undefined;
    if (input.organizationId) {
      organization = await this.organizations.findById(input.organizationId);
      if (!organization || organization.status !== 'active')
        throw badRequest('Choose an active organization');
      if (!roleAllowedFor(organization.type, input.desiredRole)) {
        throw badRequest(`A ${organization.type} does not have the role ${input.desiredRole}`);
      }
    }

    const needsVehicle = input.providesVehicle && input.desiredRole === 'driver';
    let vehicle = null;
    if (needsVehicle) {
      if (!input.vehicle) throw badRequest('Describe your vehicle');
      const plate = normalizePlate(input.vehicle.plate);
      if (!plate) throw badRequest('Enter a valid plate');
      vehicle = {
        ...input.vehicle,
        plate,
        make: input.vehicle.make.trim(),
        model: input.vehicle.model.trim(),
        color: input.vehicle.color.trim(),
      };
    }

    return {
      desiredRole: input.desiredRole,
      organizationId: organization?.id ?? null,
      firstName: input.firstName.trim(),
      lastName: input.lastName.trim(),
      documentType: input.documentType,
      documentNumber,
      birthDate: input.birthDate,
      state: input.state?.trim() || null,
      city: input.city?.trim() || null,
      providesVehicle: needsVehicle,
      vehicle,
    };
  }

  private toInput(row: ApplicationRow): ApplicationInput {
    return {
      desiredRole: row.desiredRole,
      organizationId: row.organizationId,
      firstName: row.firstName,
      lastName: row.lastName,
      documentType: row.documentType,
      documentNumber: row.documentNumber,
      birthDate: row.birthDate,
      state: row.state ?? undefined,
      city: row.city ?? undefined,
      providesVehicle: row.providesVehicle,
      vehicle: row.vehicle,
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
      throw new ApiException(
        'CONFLICT',
        'The application is under review and cannot be changed',
        HttpStatus.CONFLICT,
      );
    }
    return row;
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
    return {
      id: row.id,
      userId: row.userId,
      status: row.status,
      desiredRole: row.desiredRole,
      organization: organization
        ? { id: organization.id, type: organization.type, legalName: organization.legalName }
        : null,
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
      reviewNotes: row.reviewNotes,
      submittedAt: row.submittedAt?.toISOString() ?? null,
      reviewedAt: row.reviewedAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
    };
  }
}
