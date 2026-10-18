import { HttpStatus, Injectable } from '@nestjs/common';
import type {
  CreateInvitationRequest,
  OrganizationInvitation,
  ReceivedInvitation,
} from '@vtp/shared-types';
import { and, desc, eq, gt, inArray } from 'drizzle-orm';
import { ApiException } from '../../common/errors/api.exception.js';
import { DatabaseService } from '../../database/database.service.js';
import { AuditService } from '../audit/audit.service.js';
import { normalizeContact } from '../identity/contact.js';
import type { User } from '../identity/identity.schema.js';
import type { Authenticated, RequestMeta } from '../identity/sessions.service.js';
import { UsersService } from '../identity/users.service.js';
import type { OrganizationAccess } from './organization-access.js';
import {
  invitations,
  memberships,
  organizations,
  type InvitationRow,
} from './organizations.schema.js';
import { OrganizationsService } from './organizations.service.js';

const INVITATION_TTL_DAYS = 7;

/** The user's contacts that they have proven they control. */
function verifiedContacts(user: User): string[] {
  return [
    user.emailVerifiedAt ? user.email : null,
    user.phoneVerifiedAt ? user.phone : null,
  ].filter((value): value is string => value !== null);
}

@Injectable()
export class InvitationsService {
  constructor(
    private readonly database: DatabaseService,
    private readonly organizations: OrganizationsService,
    private readonly users: UsersService,
    private readonly audit: AuditService,
  ) {}

  /**
   * No message is sent yet (no SMS/e-mail provider): the invitee sees the invitation in the app
   * after signing in with that e-mail or phone.
   */
  async create(
    access: OrganizationAccess,
    input: CreateInvitationRequest,
    actor: Authenticated,
    meta: RequestMeta,
  ): Promise<OrganizationInvitation> {
    const { organization } = access;
    this.organizations.assertRoleAllowed(organization, input.role);
    this.organizations.assertCanManage(access, input.role);
    const destination = normalizeContact(input.contactKind, input.destination);
    if (!destination) {
      throw new ApiException(
        'VALIDATION_FAILED',
        input.contactKind === 'email'
          ? 'Enter a valid e-mail address'
          : 'Enter a valid phone number',
        HttpStatus.BAD_REQUEST,
      );
    }

    const existing = await this.users.findByVerifiedContact(input.contactKind, destination);
    if (existing) {
      const [member] = await this.database.db
        .select({ userId: memberships.userId })
        .from(memberships)
        .where(
          and(eq(memberships.organizationId, organization.id), eq(memberships.userId, existing.id)),
        )
        .limit(1);
      if (member)
        throw new ApiException('CONFLICT', 'This person is already a member', HttpStatus.CONFLICT);
    }

    const [invitation] = await this.database.db
      .insert(invitations)
      .values({
        organizationId: organization.id,
        contactKind: input.contactKind,
        destination,
        role: input.role,
        invitedBy: actor.user.id,
        expiresAt: new Date(Date.now() + INVITATION_TTL_DAYS * 86_400_000),
      })
      .onConflictDoNothing()
      .returning();
    if (!invitation) {
      throw new ApiException(
        'CONFLICT',
        'There is already a pending invitation for this person',
        HttpStatus.CONFLICT,
      );
    }
    await this.audit.record({
      action: 'organization.invitation_created',
      actorUserId: actor.user.id,
      targetType: 'invitation',
      targetId: invitation.id,
      ip: meta.ip,
      metadata: {
        organizationId: organization.id,
        role: input.role,
        contactKind: input.contactKind,
      },
    });
    return this.toDto(invitation);
  }

  async listForOrganization(organizationId: string): Promise<OrganizationInvitation[]> {
    const rows = await this.database.db
      .select()
      .from(invitations)
      .where(eq(invitations.organizationId, organizationId))
      .orderBy(desc(invitations.createdAt))
      .limit(200);
    return rows.map((row) => this.toDto(row));
  }

  async revoke(
    access: OrganizationAccess,
    invitationId: string,
    actor: Authenticated,
    meta: RequestMeta,
  ): Promise<void> {
    const [revoked] = await this.database.db
      .update(invitations)
      .set({ status: 'revoked', respondedAt: new Date() })
      .where(
        and(
          eq(invitations.id, invitationId),
          eq(invitations.organizationId, access.organization.id),
          eq(invitations.status, 'pending'),
        ),
      )
      .returning({ id: invitations.id });
    if (!revoked)
      throw new ApiException('NOT_FOUND', 'Pending invitation not found', HttpStatus.NOT_FOUND);
    await this.audit.record({
      action: 'organization.invitation_revoked',
      actorUserId: actor.user.id,
      targetType: 'invitation',
      targetId: invitationId,
      ip: meta.ip,
    });
  }

  async listReceived(user: User): Promise<ReceivedInvitation[]> {
    const contacts = verifiedContacts(user);
    if (contacts.length === 0) return [];
    const rows = await this.database.db
      .select({ invitation: invitations, organization: organizations })
      .from(invitations)
      .innerJoin(organizations, eq(organizations.id, invitations.organizationId))
      .where(
        and(
          inArray(invitations.destination, contacts),
          eq(invitations.status, 'pending'),
          gt(invitations.expiresAt, new Date()),
        ),
      )
      .orderBy(desc(invitations.createdAt));
    return rows.map(({ invitation, organization }) => ({
      id: invitation.id,
      organization: {
        id: organization.id,
        type: organization.type,
        legalName: organization.legalName,
        tradeName: organization.tradeName,
      },
      role: invitation.role,
      expiresAt: invitation.expiresAt.toISOString(),
    }));
  }

  async respond(
    auth: Authenticated,
    invitationId: string,
    decision: 'accept' | 'decline',
    meta: RequestMeta,
  ): Promise<void> {
    const contacts = verifiedContacts(auth.user);
    await this.database.db.transaction(async (tx) => {
      // Lock the invitation so two concurrent responses cannot both succeed.
      const [invitation] =
        contacts.length === 0
          ? []
          : await tx
              .select()
              .from(invitations)
              .where(
                and(
                  eq(invitations.id, invitationId),
                  inArray(invitations.destination, contacts),
                  eq(invitations.status, 'pending'),
                  gt(invitations.expiresAt, new Date()),
                ),
              )
              .for('update')
              .limit(1);
      if (!invitation)
        throw new ApiException('NOT_FOUND', 'Invitation not found', HttpStatus.NOT_FOUND);

      if (decision === 'accept') {
        const [joined] = await tx
          .insert(memberships)
          .values({
            organizationId: invitation.organizationId,
            userId: auth.user.id,
            role: invitation.role,
            invitedBy: invitation.invitedBy,
          })
          .onConflictDoNothing()
          .returning({ userId: memberships.userId });
        if (!joined)
          throw new ApiException('CONFLICT', 'You are already a member', HttpStatus.CONFLICT);
      }
      await tx
        .update(invitations)
        .set({
          status: decision === 'accept' ? 'accepted' : 'declined',
          acceptedBy: decision === 'accept' ? auth.user.id : null,
          respondedAt: new Date(),
        })
        .where(eq(invitations.id, invitation.id));
    });
    await this.audit.record({
      action:
        decision === 'accept'
          ? 'organization.invitation_accepted'
          : 'organization.invitation_declined',
      actorUserId: auth.user.id,
      targetType: 'invitation',
      targetId: invitationId,
      ip: meta.ip,
    });
  }

  private toDto(row: InvitationRow): OrganizationInvitation {
    return {
      id: row.id,
      organizationId: row.organizationId,
      contactKind: row.contactKind,
      destination: row.destination,
      role: row.role,
      status: row.status,
      expiresAt: row.expiresAt.toISOString(),
      createdAt: row.createdAt.toISOString(),
    };
  }
}
