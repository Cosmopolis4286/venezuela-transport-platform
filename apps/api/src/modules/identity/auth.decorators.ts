import { createParamDecorator, SetMetadata, type ExecutionContext } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import type { Authenticated, RequestMeta } from './sessions.service.js';

export const IS_PUBLIC = 'vtp:isPublic';

/** Opts a route out of the global AuthGuard. Every other route requires a valid access token. */
export const Public = () => SetMetadata(IS_PUBLIC, true);

export type AuthenticatedRequest = Request & { auth?: Authenticated };

/** The signed-in user and session. Only valid on routes that are not @Public(). */
export const CurrentAuth = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): Authenticated => {
    const auth = ctx.switchToHttp().getRequest<AuthenticatedRequest>().auth;
    if (!auth) throw new Error('CurrentAuth used on a route without authentication');
    return auth;
  },
);

/** Client IP (honours API_TRUST_PROXY_HOPS) and user agent, for sessions and audit events. */
export const ReqMeta = createParamDecorator((_: unknown, ctx: ExecutionContext): RequestMeta => {
  const req = ctx.switchToHttp().getRequest<Request>();
  return { ip: req.ip ?? null, userAgent: req.get('user-agent') ?? null };
});

/**
 * Stricter per-IP limit for credential and OTP endpoints (AUTH_RATE_LIMIT_MAX per minute,
 * validated at boot). Read lazily so tests can override the environment.
 */
export const AuthThrottle = () =>
  Throttle({
    default: { limit: () => Number(process.env.AUTH_RATE_LIMIT_MAX ?? 10), ttl: 60_000 },
  });
