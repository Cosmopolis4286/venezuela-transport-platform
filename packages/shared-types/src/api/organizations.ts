import { SHARED_MESSAGES } from '../i18n/shared-messages.js';

/** Kinds of organization on the platform. Each one only allows the roles in ROLES_BY_ORGANIZATION_TYPE. */
export const ORGANIZATION_TYPES = ['bus_company', 'taxi_line', 'terminal'] as const;
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
  bus_company: ['owner', 'admin', 'dispatcher', 'ticket_agent', 'driver', 'inspector'],
  taxi_line: ['owner', 'admin', 'dispatcher', 'driver'],
  terminal: ['owner', 'admin', 'dispatcher', 'inspector'],
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
] as const;
export type OrganizationPermission = (typeof ORGANIZATION_PERMISSIONS)[number];

export const ROLE_PERMISSIONS: Record<OrganizationRole, readonly OrganizationPermission[]> = {
  owner: ORGANIZATION_PERMISSIONS,
  admin: [
    'organization.manage',
    'members.view',
    'members.manage',
    'operations.dispatch',
    'routes.manage',
    'fleet.manage',
    'bookings.view',
    'tickets.sell',
    'tickets.validate',
  ],
  dispatcher: ['members.view', 'operations.dispatch', 'bookings.view'],
  ticket_agent: ['tickets.sell', 'bookings.view'],
  driver: ['trips.drive'],
  inspector: ['tickets.validate', 'bookings.view'],
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

/** Platform staff (not tied to an organization). `reviewer` approves organizations and KYC. */
export const PLATFORM_ROLES = ['admin', 'reviewer'] as const;
export type PlatformRole = (typeof PLATFORM_ROLES)[number];

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
 * `GET /api/v1/organizations/directory?type=&q=` — active organizations people can apply to.
 * Public listing data only: no RIF, contacts or members.
 */
export type OrganizationDirectoryEntry = Pick<
  Organization,
  'id' | 'type' | 'legalName' | 'tradeName' | 'state' | 'city'
>;

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
