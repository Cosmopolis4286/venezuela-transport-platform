import type { OrganizationType } from './organizations.js';

/** Documents a provider may be asked for during KYC. */
export const DOCUMENT_KINDS = [
  'identity_document',
  'driver_license',
  'medical_certificate',
  'vehicle_registration',
  'liability_insurance',
] as const;
export type DocumentKind = (typeof DOCUMENT_KINDS)[number];

export const DOCUMENT_KIND_LABELS: Record<DocumentKind, string> = {
  identity_document: 'Documento de identidad (cédula o pasaporte)',
  driver_license: 'Licencia de conducir',
  medical_certificate: 'Certificado médico',
  vehicle_registration: 'Carnet de circulación del vehículo',
  liability_insurance: 'Póliza de responsabilidad civil (RCV)',
};

/** Roles a person can apply for. Owners and admins come from registering an organization. */
export const APPLICATION_ROLES = ['driver', 'dispatcher', 'ticket_agent', 'inspector'] as const;
export type ApplicationRole = (typeof APPLICATION_ROLES)[number];

export const IDENTITY_DOCUMENT_TYPES = ['V', 'E', 'P'] as const;
/** `V` venezolano, `E` extranjero (cédula), `P` pasaporte. */
export type IdentityDocumentType = (typeof IDENTITY_DOCUMENT_TYPES)[number];

/**
 * `draft` → editable by the applicant. `submitted` → waiting for a platform reviewer.
 * `changes_requested` → editable again, see review notes. `approved` / `rejected` are final.
 */
export const APPLICATION_STATUSES = [
  'draft',
  'submitted',
  'changes_requested',
  'approved',
  'rejected',
] as const;
export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

export type DocumentReviewStatus = 'pending' | 'accepted' | 'rejected';
/** The target organization's answer once the platform has approved the application. */
export type OrganizationDecision = 'pending' | 'accepted' | 'declined';

/** Documents required to submit: drivers need licence and medical certificate; own vehicles add registration and insurance. */
export function requiredDocuments(role: ApplicationRole, providesVehicle: boolean): DocumentKind[] {
  const kinds: DocumentKind[] = ['identity_document'];
  if (role === 'driver') {
    kinds.push('driver_license', 'medical_certificate');
    if (providesVehicle) kinds.push('vehicle_registration', 'liability_insurance');
  }
  return kinds;
}

/** Accepted upload formats (checked by content, not by file name). */
export const DOCUMENT_CONTENT_TYPES = ['image/jpeg', 'image/png', 'application/pdf'] as const;
export type DocumentContentType = (typeof DOCUMENT_CONTENT_TYPES)[number];

export interface Vehicle {
  /** Normalized, e.g. `AB123CD`. */
  plate: string;
  make: string;
  model: string;
  year: number;
  color: string;
}

export interface ApplicationDocument {
  id: string;
  kind: DocumentKind;
  fileName: string;
  contentType: DocumentContentType;
  sizeBytes: number;
  /** ISO date (YYYY-MM-DD) when the document expires, if it does. */
  expiresOn: string | null;
  status: DocumentReviewStatus;
  rejectionReason: string | null;
  uploadedAt: string;
}

export interface ProviderApplication {
  id: string;
  userId: string;
  status: ApplicationStatus;
  desiredRole: ApplicationRole;
  /** Organization the applicant wants to join, if any. */
  organization: { id: string; type: OrganizationType; legalName: string } | null;
  organizationDecision: OrganizationDecision | null;
  firstName: string;
  lastName: string;
  documentType: IdentityDocumentType;
  documentNumber: string;
  /** ISO date (YYYY-MM-DD). */
  birthDate: string;
  state: string | null;
  city: string | null;
  providesVehicle: boolean;
  vehicle: Vehicle | null;
  documents: ApplicationDocument[];
  /** Kinds still missing before the application can be submitted. */
  missingDocuments: DocumentKind[];
  reviewNotes: string | null;
  submittedAt: string | null;
  reviewedAt: string | null;
  createdAt: string;
}

/** `POST /api/v1/me/application` and `PATCH` (all fields optional on PATCH). */
export interface ApplicationInput {
  desiredRole: ApplicationRole;
  organizationId?: string | null;
  firstName: string;
  lastName: string;
  documentType: IdentityDocumentType;
  documentNumber: string;
  birthDate: string;
  state?: string;
  city?: string;
  providesVehicle: boolean;
  vehicle?: Vehicle | null;
}

/** `POST /api/v1/admin/applications/:applicationId/review` */
export interface ReviewApplicationRequest {
  decision: 'approve' | 'reject' | 'request_changes';
  /** Required unless approving; shown to the applicant. */
  notes?: string;
  /** Per-document verdicts; documents not listed keep their status. */
  documents?: { documentId: string; status: 'accepted' | 'rejected'; reason?: string }[];
}

/** What a target organization sees about an approved applicant (no documents or ID numbers). */
export interface OrganizationApplicant {
  applicationId: string;
  userId: string;
  firstName: string;
  lastName: string;
  desiredRole: ApplicationRole;
  state: string | null;
  city: string | null;
  providesVehicle: boolean;
  vehicle: Vehicle | null;
  decision: OrganizationDecision;
  approvedAt: string;
}
