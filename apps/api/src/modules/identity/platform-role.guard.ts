import {
  applyDecorators,
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
  UseGuards,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { platformRoleHasPermission, type PlatformPermission } from '@vtp/shared-types';
import type { AuthenticatedRequest } from './auth.decorators.js';

const PLATFORM_PERMISSION_KEY = 'vtp:platformPermission';

/**
 * Platform staff routes: the caller's platform role (read from the database on every request by
 * the AuthGuard) must include the permission (PLATFORM_ROLE_PERMISSIONS in shared-types). The
 * route's permission wins over the controller's, so a controller can be stricter for writes and
 * a route can open reading to more roles.
 */
@Injectable()
export class PlatformPermissionGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const permission = this.reflector.getAllAndOverride<PlatformPermission | undefined>(
      PLATFORM_PERMISSION_KEY,
      [context.getHandler(), context.getClass()],
    );
    const role = context.switchToHttp().getRequest<AuthenticatedRequest>().auth?.user.platformRole;
    // No permission set by mistake: nobody but platform admins gets through.
    if (permission ? platformRoleHasPermission(role, permission) : role === 'admin') return true;
    throw new ForbiddenException('Platform staff only');
  }
}

/** Restricts a controller or route to platform staff whose role has `permission`. */
export const RequirePlatformPermission = (permission: PlatformPermission) =>
  applyDecorators(
    SetMetadata(PLATFORM_PERMISSION_KEY, permission),
    UseGuards(PlatformPermissionGuard),
  );
