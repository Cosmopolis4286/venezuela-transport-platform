import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ApiException } from '../../common/errors/api.exception.js';
import { IS_PUBLIC, type AuthenticatedRequest } from './auth.decorators.js';
import { SessionsService } from './sessions.service.js';

/**
 * Registered globally: routes are private unless marked @Public().
 * Missing token → 401 UNAUTHORIZED; invalid or expired token → 401 SESSION_EXPIRED (refresh).
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly sessions: SessionsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const match = /^Bearer\s+(\S+)$/i.exec(request.get('authorization') ?? '');
    if (!match) throw new UnauthorizedException('Authentication required');

    const auth = await this.sessions.authenticate(match[1]!);
    if (!auth) throw ApiException.sessionExpired();
    request.auth = auth;
    return true;
  }
}
