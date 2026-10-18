import type { AuthTokens } from '@vtp/shared-types';

/**
 * Session cookies. Tokens never reach browser JavaScript (httpOnly). In production the `__Host-`
 * prefix forces Secure, path=/ and no Domain, so subdomains cannot set or read them.
 */
export function cookieNames(production: boolean) {
  const prefix = production ? '__Host-' : '';
  return {
    access: `${prefix}vtp_at`,
    refresh: `${prefix}vtp_rt`,
    /** Access-token expiry (ms since epoch), so the proxy can refresh without calling the API. */
    accessExpiry: `${prefix}vtp_at_exp`,
  } as const;
}

export interface CookieToSet {
  name: string;
  value: string;
  options: { httpOnly: true; secure: boolean; sameSite: 'lax'; path: '/'; expires: Date };
}

export function sessionCookies(tokens: AuthTokens, production: boolean): CookieToSet[] {
  const names = cookieNames(production);
  const base = {
    httpOnly: true as const,
    secure: production,
    sameSite: 'lax' as const,
    path: '/' as const,
  };
  const accessExpires = new Date(tokens.accessTokenExpiresAt);
  const refreshExpires = new Date(tokens.refreshTokenExpiresAt);
  return [
    { name: names.access, value: tokens.accessToken, options: { ...base, expires: accessExpires } },
    {
      name: names.refresh,
      value: tokens.refreshToken,
      options: { ...base, expires: refreshExpires },
    },
    {
      name: names.accessExpiry,
      value: String(accessExpires.getTime()),
      options: { ...base, expires: refreshExpires },
    },
  ];
}

/** Refresh a little early so a request never reaches the API with a token about to expire. */
export const REFRESH_MARGIN_MS = 60_000;

export function needsRefresh(
  accessToken: string | undefined,
  expiry: string | undefined,
  now = Date.now(),
): boolean {
  if (!accessToken || !expiry) return true;
  const expiresAt = Number(expiry);
  return !Number.isFinite(expiresAt) || expiresAt - REFRESH_MARGIN_MS <= now;
}
