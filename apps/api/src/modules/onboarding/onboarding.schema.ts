import { sql } from 'drizzle-orm';
import {
  boolean,
  date,
  primaryKey,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import {
  APPLICATION_ROLES,
  APPLICATION_STATUSES,
  DOCUMENT_CONTENT_TYPES,
  DOCUMENT_KINDS,
  IDENTITY_DOCUMENT_TYPES,
  type Vehicle,
} from '@vtp/shared-types';
import { timestamps, users } from '../identity/identity.schema.js';
import { organizations } from '../organizations/organizations.schema.js';

export const applicationRole = pgEnum('application_role', APPLICATION_ROLES);
export const applicationStatus = pgEnum('application_status', APPLICATION_STATUSES);
export const identityDocumentType = pgEnum('identity_document_type', IDENTITY_DOCUMENT_TYPES);
export const documentKind = pgEnum('document_kind', DOCUMENT_KINDS);
export const documentContentType = pgEnum('document_content_type', DOCUMENT_CONTENT_TYPES);
export const documentReviewStatus = pgEnum('document_review_status', [
  'pending',
  'accepted',
  'rejected',
]);
export const organizationDecision = pgEnum('organization_decision', [
  'pending',
  'accepted',
  'declined',
]);

/**
 * A person's request to work as a driver or staff member (KYC). Contains personal data:
 * readable only by the applicant, platform reviewers and — after approval — the target organization.
 */
export const applications = pgTable(
  'provider_applications',
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    status: applicationStatus().notNull().default('draft'),
    desiredRole: applicationRole().notNull(),
    organizationId: uuid().references(() => organizations.id, { onDelete: 'set null' }),
    /** Null until the platform approves; then the target organization accepts or declines. */
    organizationDecision: organizationDecision(),
    firstName: text().notNull(),
    lastName: text().notNull(),
    documentType: identityDocumentType().notNull(),
    documentNumber: text().notNull(),
    birthDate: date({ mode: 'string' }).notNull(),
    state: text(),
    city: text(),
    providesVehicle: boolean().notNull().default(false),
    vehicle: jsonb().$type<Vehicle>(),
    reviewNotes: text(),
    reviewedBy: uuid().references(() => users.id, { onDelete: 'set null' }),
    reviewedAt: timestamp({ withTimezone: true }),
    submittedAt: timestamp({ withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    // One open application per person; finished ones (approved/rejected) are kept as history.
    uniqueIndex('provider_applications_open_key')
      .on(t.userId)
      .where(sql`${t.status} in ('draft', 'submitted', 'changes_requested')`),
    index('provider_applications_status_idx').on(t.status, t.submittedAt),
    index('provider_applications_organization_idx').on(t.organizationId, t.organizationDecision),
  ],
);

/** Uploaded files. Bytes live in FileStorage under `storageKey`; never in the database. */
export const applicationDocuments = pgTable(
  'provider_application_documents',
  {
    id: uuid().primaryKey().defaultRandom(),
    applicationId: uuid()
      .notNull()
      .references(() => applications.id, { onDelete: 'cascade' }),
    kind: documentKind().notNull(),
    storageKey: text().notNull(),
    /** Display only — sanitized, never used to build paths. */
    fileName: text().notNull(),
    contentType: documentContentType().notNull(),
    sizeBytes: integer().notNull(),
    sha256: text().notNull(),
    expiresOn: date({ mode: 'string' }),
    status: documentReviewStatus().notNull().default('pending'),
    rejectionReason: text(),
    uploadedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Uploading a kind again replaces the previous file.
    uniqueIndex('provider_application_documents_kind_key').on(t.applicationId, t.kind),
  ],
);

/**
 * A new copy of an approved driver's document (ADR-042). It replaces the current one when staff
 * accept it; the file is kept only while pending (`storage_key` is then cleared).
 */
export const documentRenewals = pgTable(
  'document_renewals',
  {
    id: uuid().primaryKey().defaultRandom(),
    applicationId: uuid()
      .notNull()
      .references(() => applications.id, { onDelete: 'cascade' }),
    kind: documentKind().notNull(),
    storageKey: text(),
    fileName: text().notNull(),
    contentType: documentContentType().notNull(),
    sizeBytes: integer().notNull(),
    sha256: text().notNull(),
    expiresOn: date({ mode: 'string' }).notNull(),
    status: documentReviewStatus().notNull().default('pending'),
    rejectionReason: text(),
    reviewedBy: uuid().references(() => users.id, { onDelete: 'set null' }),
    reviewedAt: timestamp({ withTimezone: true }),
    uploadedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // One pending renewal per document: uploading again replaces it.
    uniqueIndex('document_renewals_pending_key')
      .on(t.applicationId, t.kind)
      .where(sql`${t.status} = 'pending'`),
  ],
);

/**
 * Expiry reminders already sent (ADR-042), one per document, expiry date and stage: a renewed
 * document has a new date and is reminded again. `subject` is `application:<documentId>` or
 * `vehicle:<vehicleId>:<kind>`.
 */
export const documentExpiryNotices = pgTable(
  'document_expiry_notices',
  {
    subject: text().notNull(),
    expiresOn: date({ mode: 'string' }).notNull(),
    stage: text({ enum: ['soon', 'expired'] }).notNull(),
    sentAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.subject, t.expiresOn, t.stage] })],
);

export type ApplicationRow = typeof applications.$inferSelect;
export type DocumentRenewalRow = typeof documentRenewals.$inferSelect;
export type ApplicationDocumentRow = typeof applicationDocuments.$inferSelect;
