import { SHARED_MESSAGES } from '../i18n/shared-messages.js';

/** Kinds of organization on the platform. Each one only allows the roles in ROLES_BY_ORGANIZATION_TYPE. */
export const ORGANIZATION_TYPES = ['bus_company', 'taxi_line', 'moto_line', 'terminal'] as const;
export type OrganizationType = (typeof ORGANIZATION_TYPES)[number];

/**
 * `pending_review` → created, staff can be invited, but nothing operational is allowed until a
 * platform reviewer approves it (`active`). `suspended` and `rejected` block operations.
 */
export const ORGANIZATION_STATUSES = ['pending_review', 'active', 'suspended', 'rejected'] as const;
export type OrganizationStatus = (typeof ORGANIZATION_STATUSES)[number];

export const ORGANIZATION_ROLES = [
  'owner',
  'admin',
  'dispatcher',
  'ticket_agent',
  'driver',
  'inspector',
  /** Money without operations: balance, settlements, collections, refunds and sales reports. */
  'accountant',
  /** Yard or terminal chief: dispatch, ticket checks and occupancy, without money or routes. */
  'supervisor',
] as const;
export type OrganizationRole = (typeof ORGANIZATION_ROLES)[number];

/** Spanish labels for UIs. */
export const ORGANIZATION_ROLE_LABELS: Record<OrganizationRole, string> = {
  owner: 'Dueño',
  admin: 'Administrador',
  dispatcher: 'Despachador',
  ticket_agent: 'Taquillero',
  driver: 'Conductor',
  inspector: 'Inspector de boletos',
  accountant: 'Contador',
  supervisor: 'Supervisor',
};

export const ORGANIZATION_TYPE_LABELS: Record<OrganizationType, string> =
  SHARED_MESSAGES.es.organizationType;

export const ORGANIZATION_STATUS_LABELS: Record<OrganizationStatus, string> = {
  pending_review: 'En revisión',
  active: 'Activa',
  suspended: 'Suspendida',
  rejected: 'Rechazada',
};

export const ROLES_BY_ORGANIZATION_TYPE: Record<OrganizationType, readonly OrganizationRole[]> = {
  bus_company: [
    'owner',
    'admin',
    'dispatcher',
    'ticket_agent',
    'driver',
    'inspector',
    'accountant',
    'supervisor',
  ],
  taxi_line: ['owner', 'admin', 'dispatcher', 'driver', 'accountant'],
  moto_line: ['owner', 'admin', 'dispatcher', 'driver', 'accountant'],
  terminal: ['owner', 'admin', 'dispatcher', 'inspector', 'accountant', 'supervisor'],
};

/** What a member may do inside their organization. Future modules add their own permissions here. */
export const ORGANIZATION_PERMISSIONS = [
  'organization.manage',
  'members.view',
  'members.manage',
  'operations.dispatch',
  'routes.manage',
  'fleet.manage',
  'bookings.view',
  'tickets.sell',
  'tickets.validate',
  'trips.drive',
  'finance.view',
  /** Operating reports without money (occupancy); sales reports also need `finance.view`. */
  'reports.view',
  /** Receive passengers' payments in the organization's own accounts (ADR-027): accounts, verification, refunds. */
  'finance.manage',
] as const;
export type OrganizationPermission = (typeof ORGANIZATION_PERMISSIONS)[number];

export const ROLE_PERMISSIONS: Record<OrganizationRole, readonly OrganizationPermission[]> = {
  owner: ORGANIZATION_PERMISSIONS,
  admin: ORGANIZATION_PERMISSIONS.filter((p) => p !== 'trips.drive'),
  dispatcher: ['members.view', 'operations.dispatch', 'bookings.view', 'reports.view'],
  ticket_agent: ['tickets.sell', 'bookings.view'],
  driver: ['trips.drive', 'tickets.validate'],
  inspector: ['tickets.validate', 'bookings.view'],
  accountant: ['bookings.view', 'reports.view', 'finance.view', 'finance.manage'],
  supervisor: [
    'members.view',
    'operations.dispatch',
    'bookings.view',
    'tickets.validate',
    'reports.view',
  ],
};

export function roleAllowedFor(type: OrganizationType, role: OrganizationRole): boolean {
  return ROLES_BY_ORGANIZATION_TYPE[type].includes(role);
}

/** Roles whose permissions include `permission`, e.g. who can drive (`trips.drive`). */
export function rolesWith(permission: OrganizationPermission): OrganizationRole[] {
  return ORGANIZATION_ROLES.filter((role) => roleHasPermission(role, permission));
}

export function roleHasPermission(
  role: OrganizationRole,
  permission: OrganizationPermission,
): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}

/**
 * Platform staff (not tied to an organization). `admin` can do everything; the others are
 * scoped: `reviewer` approves organizations and KYC and curates stops, `finance` handles the money
 * (payments, settlements, refunds, invoices) and `support` helps passengers (bookings, WhatsApp
 * taxis) and can see organizations and applications without deciding on them.
 */
export const PLATFORM_ROLES = ['admin', 'reviewer', 'finance', 'support'] as const;
export type PlatformRole = (typeof PLATFORM_ROLES)[number];

export const PLATFORM_ROLE_LABELS: Record<PlatformRole, string> = {
  admin: 'Administración',
  reviewer: 'Revisión',
  finance: 'Finanzas',
  support: 'Soporte',
};

/** What platform staff may do. The API checks one of these on every admin route. */
export const PLATFORM_PERMISSIONS = [
  /** List organizations and their state. */
  'organizations.view',
  /** Approve, reject or suspend organizations. */
  'organizations.review',
  /** List KYC applications (who, for which organization, status): no ID numbers or documents. */
  'applications.view',
  /** Open an application (ID number, birth date, documents) and decide on it. */
  'applications.review',
  /** See zones and the stop catalog. */
  'network.view',
  /** Create and edit stops. */
  'network.manage',
  /** Create and edit operating zones (where the platform sells). */
  'zones.manage',
  /** Find a booking by its code (support at the counter or on WhatsApp). */
  'bookings.search',
  /** Ask for taxis and motorcycles for WhatsApp customers. */
  'taxi.assist',
  /** Payments, receiving accounts, rates, settlements, payouts, refunds and invoices. */
  'finance.manage',
  /** Trip pack products. */
  'products.manage',
  /** See and attend the emergency alerts (SOS) sent from taxi and motorcycle rides (ADR-043). */
  'safety.manage',
  /** Platform metrics. */
  'metrics.view',
  /** Create the lines the platform runs for independent drivers (ADR-039). */
  'independents.manage',
] as const;
export type PlatformPermission = (typeof PLATFORM_PERMISSIONS)[number];

export const PLATFORM_ROLE_PERMISSIONS: Record<PlatformRole, readonly PlatformPermission[]> = {
  admin: PLATFORM_PERMISSIONS,
  reviewer: [
    'organizations.view',
    'organizations.review',
    'applications.view',
    'applications.review',
    'network.view',
    'network.manage',
    'bookings.search',
    'taxi.assist',
  ],
  finance: [
    'organizations.view',
    'network.view',
    'bookings.search',
    'finance.manage',
    'metrics.view',
  ],
  support: [
    'organizations.view',
    'applications.view',
    'network.view',
    'bookings.search',
    'taxi.assist',
    'safety.manage',
  ],
};

export function platformRoleHasPermission(
  role: PlatformRole | null | undefined,
  permission: PlatformPermission,
): boolean {
  return !!role && PLATFORM_ROLE_PERMISSIONS[role].includes(permission);
}

export interface Organization {
  id: string;
  type: OrganizationType;
  legalName: string;
  tradeName: string | null;
  /** Venezuelan tax id, normalized as `J-12345678-9`. */
  rif: string;
  status: OrganizationStatus;
  phone: string | null;
  email: string | null;
  state: string | null;
  city: string | null;
  /** A line the platform runs for independent drivers (ADR-039). */
  operatedByPlatform: boolean;
  createdAt: string;
}

/** An organization as seen by one of its members. */
export interface OrganizationMembershipSummary {
  organization: Organization;
  role: OrganizationRole;
  permissions: OrganizationPermission[];
}

export interface OrganizationMember {
  userId: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  role: OrganizationRole;
  joinedAt: string;
}

export type InvitationStatus = 'pending' | 'accepted' | 'declined' | 'revoked';

export interface OrganizationInvitation {
  id: string;
  organizationId: string;
  contactKind: 'email' | 'phone';
  /** Full destination for organization admins; masked when shown to the invitee. */
  destination: string;
  role: OrganizationRole;
  status: InvitationStatus;
  expiresAt: string;
  createdAt: string;
}

/** An invitation addressed to one of the signed-in user's verified contacts. */
export interface ReceivedInvitation {
  id: string;
  organization: Pick<Organization, 'id' | 'type' | 'legalName' | 'tradeName'>;
  role: OrganizationRole;
  expiresAt: string;
}

/**
 * `POST /api/v1/admin/independent-lines` (ADR-039): a taxi or motorcycle line the platform runs
 * for independent drivers. Active at once; the admin who creates it becomes its owner.
 */
export interface CreateIndependentLineRequest {
  type: 'taxi_line' | 'moto_line';
  legalName: string;
  tradeName?: string;
  /** The platform's RIF for this line (each organization needs its own). */
  rif: string;
}

/** `GET /api/v1/admin/independent-lines`: each line with its drivers and vehicles. */
export interface IndependentLine {
  organization: Organization;
  drivers: number;
  vehicles: number;
  /** Approved independent drivers' applications still in review. */
  pendingApplications: number;
}

/** `POST /api/v1/organizations` — the creator becomes owner; status starts as `pending_review`. */
export interface CreateOrganizationRequest {
  type: OrganizationType;
  legalName: string;
  tradeName?: string;
  rif: string;
  phone?: string;
  email?: string;
  state?: string;
  city?: string;
}

/** `PATCH /api/v1/organizations/:organizationId` */
export type UpdateOrganizationRequest = Partial<Omit<CreateOrganizationRequest, 'type' | 'rif'>>;

/** `POST /api/v1/organizations/:organizationId/invitations` */
export interface CreateInvitationRequest {
  contactKind: 'email' | 'phone';
  destination: string;
  role: OrganizationRole;
}

/** `PATCH /api/v1/organizations/:organizationId/members/:userId` */
export interface UpdateMemberRoleRequest {
  role: OrganizationRole;
}

/** `POST /api/v1/admin/organizations/:organizationId/review` */
export interface ReviewOrganizationRequest {
  decision: 'approve' | 'reject' | 'suspend';
  /** Required for reject/suspend; shown to the organization owner. */
  notes?: string;
}
