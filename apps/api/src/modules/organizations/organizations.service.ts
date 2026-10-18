import { HttpStatus, Injectable } from '@nestjs/common';
import {
  ROLE_PERMISSIONS,
  roleAllowedFor,
  type CreateOrganizationRequest,
  type Organization,
  type OrganizationMember,
  type OrganizationMembershipSummary,
  type OrganizationRole,
  type OrganizationStatus,
  type ReviewOrganizationRequest,
  type UpdateOrganizationRequest,
} from '@vtp/shared-types';
import { and, asc, count, desc, eq } from 'drizzle-orm';
import { ApiException } from '../../common/errors/api.exception.js';
import { DatabaseService, type Transaction } from '../../database/database.service.js';
import { AuditService } from '../audit/audit.service.js';
import { normalizeEmail, normalizePhone } from '../identity/contact.js';
import type { Authenticated, RequestMeta } from '../identity/sessions.service.js';
import { UsersService } from '../identity/users.service.js';
import type { OrganizationAccess } from './organization-access.js';
import { memberships, organizations, type OrganizationRow } from './organizations.schema.js';
import { normalizeRif } from './rif.js';

/** Caps how many unreviewed organizations one person can register (keeps the review queue usable). */
const MAX_PENDING_PER_USER = 5;

/** Allowed review transitions: decision → statuses it may be applied to. */
const REVIEW_TRANSITIONS: Record<
  ReviewOrganizationRequest['decision'],
  { from: OrganizationStatus[]; to: OrganizationStatus }
> = {
  approve: { from: ['pending_review', 'suspended', 'rejected'], to: 'active' },
  reject: { from: ['pending_review'], to: 'rejected' },
  suspend: { from: ['active'], to: 'suspended' },
};

@Injectable()
export class OrganizationsService {
  constructor(
    private readonly database: DatabaseService,
    private readonly users: UsersService,
    private readonly audit: AuditService,
  ) {}

  /** Anyone signed in may register an organization; it stays `pending_review` until approved. */
  async create(
    auth: Authenticated,
    input: CreateOrganizationRequest,
    meta: RequestMeta,
  ): Promise<OrganizationMembershipSummary> {
    const values = {
      type: input.type,
      rif: this.requireRif(input.rif),
      createdBy: auth.user.id,
      ...this.contactFields(input),
      legalName: input.legalName.trim(),
    };
    const [pending] = await this.database.db
      .select({ total: count() })
      .from(organizations)
      .where(
        and(eq(organizations.createdBy, auth.user.id), eq(organizations.status, 'pending_review')),
      );
    if ((pending?.total ?? 0) >= MAX_PENDING_PER_USER) {
      throw new ApiException(
        'RATE_LIMITED',
        'You have too many organizations awaiting review',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    const organization = await this.database.db.transaction(async (tx) => {
      const [created] = await tx
        .insert(organizations)
        .values(values)
        .onConflictDoNothing({ target: organizations.rif })
        .returning();
      if (!created) {
        throw new ApiException(
          'CONFLICT',
          'An organization with this RIF is already registered',
          HttpStatus.CONFLICT,
        );
      }
      await tx
        .insert(memberships)
        .values({ organizationId: created.id, userId: auth.user.id, role: 'owner' });
      return created;
    });
    await this.audit.record({
      action: 'organization.created',
      actorUserId: auth.user.id,
      targetType: 'organization',
      targetId: organization.id,
      ip: meta.ip,
      metadata: { type: organization.type },
    });
    return this.summary(organization, 'owner');
  }

  async listForUser(userId: string): Promise<OrganizationMembershipSummary[]> {
    const rows = await this.database.db
      .select({ organization: organizations, role: memberships.role })
      .from(memberships)
      .innerJoin(organizations, eq(organizations.id, memberships.organizationId))
      .where(eq(memberships.userId, userId))
      .orderBy(asc(organizations.legalName));
    return rows.map((row) => this.summary(row.organization, row.role));
  }

  async update(
    access: OrganizationAccess,
    input: UpdateOrganizationRequest,
    actor: Authenticated,
    meta: RequestMeta,
  ): Promise<Organization> {
    const changes = this.contactFields(input);
    if (input.legalName !== undefined)
      Object.assign(changes, { legalName: input.legalName.trim() });
    const [updated] = await this.database.db
      .update(organizations)
      .set(changes)
      .where(eq(organizations.id, access.organization.id))
      .returning();
    await this.audit.record({
      action: 'organization.updated',
      actorUserId: actor.user.id,
      targetType: 'organization',
      targetId: access.organization.id,
      ip: meta.ip,
      metadata: { fields: Object.keys(changes) },
    });
    return this.toDto(updated!);
  }

  async listMembers(organizationId: string): Promise<OrganizationMember[]> {
    const rows = await this.database.db
      .select()
      .from(memberships)
      .where(eq(memberships.organizationId, organizationId))
      .orderBy(asc(memberships.createdAt));
    const people = new Map(
      (await this.users.findManyByIds(rows.map((r) => r.userId))).map((u) => [u.id, u]),
    );
    return rows.map((row) => {
      const user = people.get(row.userId);
      return {
        userId: row.userId,
        firstName: user?.firstName ?? null,
        lastName: user?.lastName ?? null,
        email: user?.email ?? null,
        phone: user?.phone ?? null,
        role: row.role,
        joinedAt: row.createdAt.toISOString(),
      };
    });
  }

  async changeMemberRole(
    access: OrganizationAccess,
    targetUserId: string,
    role: OrganizationRole,
    actor: Authenticated,
    meta: RequestMeta,
  ): Promise<void> {
    this.assertRoleAllowed(access.organization, role);
    const target = await this.requireMember(access.organization.id, targetUserId);
    if (target.role === role) return;
    this.assertCanManage(access, target.role, role);
    await this.database.db.transaction(async (tx) => {
      await tx
        .update(memberships)
        .set({ role })
        .where(
          and(
            eq(memberships.organizationId, access.organization.id),
            eq(memberships.userId, targetUserId),
          ),
        );
      if (target.role === 'owner') await this.assertOwnerRemains(tx, access.organization.id);
    });
    await this.audit.record({
      action: 'organization.member_role_changed',
      actorUserId: actor.user.id,
      targetType: 'user',
      targetId: targetUserId,
      ip: meta.ip,
      metadata: { organizationId: access.organization.id, from: target.role, to: role },
    });
  }

  async removeMember(
    access: OrganizationAccess,
    targetUserId: string,
    actor: Authenticated,
    meta: RequestMeta,
  ): Promise<void> {
    const target = await this.requireMember(access.organization.id, targetUserId);
    this.assertCanManage(access, target.role);
    await this.database.db.transaction(async (tx) => {
      await tx
        .delete(memberships)
        .where(
          and(
            eq(memberships.organizationId, access.organization.id),
            eq(memberships.userId, targetUserId),
          ),
        );
      if (target.role === 'owner') await this.assertOwnerRemains(tx, access.organization.id);
    });
    await this.audit.record({
      action: 'organization.member_removed',
      actorUserId: actor.user.id,
      targetType: 'user',
      targetId: targetUserId,
      ip: meta.ip,
      metadata: { organizationId: access.organization.id, role: target.role },
    });
  }

  async listByStatus(status: OrganizationStatus): Promise<Organization[]> {
    const rows = await this.database.db
      .select()
      .from(organizations)
      .where(eq(organizations.status, status))
      .orderBy(desc(organizations.createdAt))
      .limit(200);
    return rows.map((row) => this.toDto(row));
  }

  /** Platform staff decision. Notes are required when rejecting or suspending. */
  async review(
    organizationId: string,
    input: ReviewOrganizationRequest,
    reviewer: Authenticated,
    meta: RequestMeta,
  ): Promise<Organization> {
    const transition = REVIEW_TRANSITIONS[input.decision];
    const notes = input.notes?.trim() || null;
    if (input.decision !== 'approve' && !notes) {
      throw new ApiException(
        'VALIDATION_FAILED',
        'Explain the decision in notes',
        HttpStatus.BAD_REQUEST,
      );
    }
    const [current] = await this.database.db
      .select()
      .from(organizations)
      .where(eq(organizations.id, organizationId))
      .limit(1);
    if (!current)
      throw new ApiException('NOT_FOUND', 'Organization not found', HttpStatus.NOT_FOUND);
    if (!transition.from.includes(current.status)) {
      throw new ApiException(
        'CONFLICT',
        `Cannot ${input.decision} an organization that is ${current.status}`,
        HttpStatus.CONFLICT,
      );
    }
    const [updated] = await this.database.db
      .update(organizations)
      .set({
        status: transition.to,
        reviewedBy: reviewer.user.id,
        reviewedAt: new Date(),
        reviewNotes: notes,
      })
      .where(and(eq(organizations.id, organizationId), eq(organizations.status, current.status)))
      .returning();
    if (!updated)
      throw new ApiException(
        'CONFLICT',
        'The organization changed, reload and retry',
        HttpStatus.CONFLICT,
      );
    await this.audit.record({
      action: `organization.${input.decision === 'approve' ? 'approved' : input.decision === 'reject' ? 'rejected' : 'suspended'}`,
      actorUserId: reviewer.user.id,
      targetType: 'organization',
      targetId: organizationId,
      ip: meta.ip,
      metadata: { from: current.status, to: transition.to },
    });
    return this.toDto(updated);
  }

  summary(organization: OrganizationRow, role: OrganizationRole): OrganizationMembershipSummary {
    return {
      organization: this.toDto(organization),
      role,
      permissions: [...ROLE_PERMISSIONS[role]],
    };
  }

  toDto(row: OrganizationRow): Organization {
    return {
      id: row.id,
      type: row.type,
      legalName: row.legalName,
      tradeName: row.tradeName,
      rif: row.rif,
      status: row.status,
      phone: row.phone,
      email: row.email,
      state: row.state,
      city: row.city,
      createdAt: row.createdAt.toISOString(),
    };
  }

  /** Only owners may grant, change or remove the owner role. */
  assertCanManage(
    access: OrganizationAccess,
    targetRole: OrganizationRole,
    newRole?: OrganizationRole,
  ): void {
    const touchesOwner = targetRole === 'owner' || newRole === 'owner';
    if (touchesOwner && access.membership.role !== 'owner') {
      throw new ApiException('FORBIDDEN', 'Only an owner can manage owners', HttpStatus.FORBIDDEN);
    }
  }

  assertRoleAllowed(organization: OrganizationRow, role: OrganizationRole): void {
    if (!roleAllowedFor(organization.type, role)) {
      throw new ApiException(
        'VALIDATION_FAILED',
        `Role ${role} does not exist in a ${organization.type}`,
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  private async requireMember(organizationId: string, userId: string) {
    const [member] = await this.database.db
      .select()
      .from(memberships)
      .where(and(eq(memberships.organizationId, organizationId), eq(memberships.userId, userId)))
      .limit(1);
    if (!member) throw new ApiException('NOT_FOUND', 'Member not found', HttpStatus.NOT_FOUND);
    return member;
  }

  /** Runs inside the transaction that removed/demoted an owner; aborts it if none would remain. */
  private async assertOwnerRemains(tx: Transaction, organizationId: string): Promise<void> {
    const [owners] = await tx
      .select({ total: count() })
      .from(memberships)
      .where(and(eq(memberships.organizationId, organizationId), eq(memberships.role, 'owner')));
    if ((owners?.total ?? 0) === 0) {
      throw new ApiException(
        'CONFLICT',
        'An organization must keep at least one owner',
        HttpStatus.CONFLICT,
      );
    }
  }

  private requireRif(input: string): string {
    const rif = normalizeRif(input);
    if (!rif)
      throw new ApiException(
        'VALIDATION_FAILED',
        'Enter a valid RIF, e.g. J-12345678-9',
        HttpStatus.BAD_REQUEST,
      );
    return rif;
  }

  private contactFields(input: UpdateOrganizationRequest) {
    const fields: Partial<
      Pick<OrganizationRow, 'tradeName' | 'phone' | 'email' | 'state' | 'city'>
    > = {};
    if (input.tradeName !== undefined) fields.tradeName = input.tradeName.trim() || null;
    if (input.state !== undefined) fields.state = input.state.trim() || null;
    if (input.city !== undefined) fields.city = input.city.trim() || null;
    if (input.phone !== undefined) {
      const phone = input.phone.trim() ? normalizePhone(input.phone) : null;
      if (input.phone.trim() && !phone)
        throw new ApiException(
          'VALIDATION_FAILED',
          'Enter a valid phone number',
          HttpStatus.BAD_REQUEST,
        );
      fields.phone = phone;
    }
    if (input.email !== undefined) {
      const email = input.email.trim() ? normalizeEmail(input.email) : null;
      if (input.email.trim() && !email)
        throw new ApiException(
          'VALIDATION_FAILED',
          'Enter a valid e-mail address',
          HttpStatus.BAD_REQUEST,
        );
      fields.email = email;
    }
    return fields;
  }
}
