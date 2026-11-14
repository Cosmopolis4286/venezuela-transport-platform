import {
  applyDecorators,
  type CanActivate,
  createParamDecorator,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
  NotFoundException,
  SetMetadata,
  UseGuards,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { roleHasPermission, type OrganizationPermission } from '@vtp/shared-types';
import { ApiException } from '../../common/errors/api.exception.js';
import { and, eq } from 'drizzle-orm';
import { DatabaseService } from '../../database/database.service.js';
import type { AuthenticatedRequest } from '../identity/auth.decorators.js';
import {
  memberships,
  organizations,
  type MembershipRow,
  type OrganizationRow,
} from './organizations.schema.js';

export interface OrganizationAccess {
  organization: OrganizationRow;
  membership: MembershipRow;
}

type AccessRequest = AuthenticatedRequest & { organizationAccess?: OrganizationAccess };

const PERMISSION_KEY = 'vtp:organizationPermission';

/**
 * Permissions that run the business (trips, sales, tickets): only an approved (`active`)
 * organization may use them to change anything. One in review can still set itself up (members,
 * fleet, draft routes); a suspended or rejected one keeps read access, nothing more.
 */
const OPERATIONAL: readonly OrganizationPermission[] = [
  'operations.dispatch',
  'tickets.sell',
  'tickets.validate',
  'trips.drive',
];
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Resolves `:organizationId` against the caller's memberships. Non-members get 404 (the
 * organization's existence is not revealed); members without the permission get 403.
 */
@Injectable()
export class OrganizationAccessGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly database: DatabaseService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AccessRequest>();
    const organizationId = request.params.organizationId;
    const userId = request.auth?.user.id;
    if (!userId || typeof organizationId !== 'string' || !UUID.test(organizationId)) {
      throw new NotFoundException('Organization not found');
    }

    const [row] = await this.database.db
      .select({ organization: organizations, membership: memberships })
      .from(memberships)
      .innerJoin(organizations, eq(organizations.id, memberships.organizationId))
      .where(and(eq(memberships.organizationId, organizationId), eq(memberships.userId, userId)))
      .limit(1);
    if (!row) throw new NotFoundException('Organization not found');

    // The route's own permission wins; otherwise the controller's. Reading only the handler
    // ignored a permission set on the class (any member could use those routes).
    const permission = this.reflector.getAllAndOverride<OrganizationPermission | undefined>(
      PERMISSION_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (permission && !roleHasPermission(row.membership.role, permission)) {
      throw new ForbiddenException('Your role does not allow this action');
    }
    if (
      permission &&
      OPERATIONAL.includes(permission) &&
      row.organization.status !== 'active' &&
      !SAFE_METHODS.has(request.method)
    ) {
      throw ApiException.conflict(
        'The organization is not active: it cannot operate',
        'ORGANIZATION_NOT_ACTIVE',
      );
    }
    request.organizationAccess = row;
    return true;
  }
}

/** Requires membership of `:organizationId` and, optionally, a permission of the member's role. */
export const RequireOrganizationAccess = (permission?: OrganizationPermission) =>
  applyDecorators(SetMetadata(PERMISSION_KEY, permission), UseGuards(OrganizationAccessGuard));

export const CurrentOrganization = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): OrganizationAccess => {
    const access = ctx.switchToHttp().getRequest<AccessRequest>().organizationAccess;
    if (!access) throw new Error('CurrentOrganization used without RequireOrganizationAccess');
    return access;
  },
);
