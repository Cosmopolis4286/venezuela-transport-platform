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
import type { PlatformRole } from '@vtp/shared-types';
import type { AuthenticatedRequest } from './auth.decorators.js';

const PLATFORM_ROLES_KEY = 'vtp:platformRoles';

@Injectable()
export class PlatformRoleGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const allowed =
      this.reflector.get<PlatformRole[]>(PLATFORM_ROLES_KEY, context.getHandler()) ??
      this.reflector.get<PlatformRole[]>(PLATFORM_ROLES_KEY, context.getClass()) ??
      [];
    const role = context.switchToHttp().getRequest<AuthenticatedRequest>().auth?.user.platformRole;
    // Platform admins can do everything reviewers can.
    if (role && (role === 'admin' || allowed.includes(role))) return true;
    throw new ForbiddenException('Platform staff only');
  }
}

/** Restricts a controller or route to platform staff with one of the given roles. */
export const RequirePlatformRole = (...roles: PlatformRole[]) =>
  applyDecorators(SetMetadata(PLATFORM_ROLES_KEY, roles), UseGuards(PlatformRoleGuard));
