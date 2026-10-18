import type { AuthTokens } from '@vtp/shared-types';
import { describe, expect, it } from 'vitest';
import { cookieNames, needsRefresh, sessionCookies } from './cookies';

const tokens: AuthTokens = {
  tokenType: 'Bearer',
  accessToken: 'vtp_at_x',
  accessTokenExpiresAt: '2030-01-01T00:15:00.000Z',
  refreshToken: 'vtp_rt_y',
  refreshTokenExpiresAt: '2030-01-31T00:00:00.000Z',
};

describe('session cookies', () => {
  it('uses the __Host- prefix and Secure in production only', () => {
    expect(cookieNames(true).access).toBe('__Host-vtp_at');
    expect(cookieNames(false).access).toBe('vtp_at');
    const prod = sessionCookies(tokens, true);
    expect(
      prod.every((c) => c.options.httpOnly && c.options.secure && c.options.sameSite === 'lax'),
    ).toBe(true);
    expect(sessionCookies(tokens, false).every((c) => !c.options.secure)).toBe(true);
  });

  it('expires each cookie with its token', () => {
    const [access, refresh, expiry] = sessionCookies(tokens, false);
    expect(access!.options.expires.toISOString()).toBe(tokens.accessTokenExpiresAt);
    expect(refresh!.options.expires.toISOString()).toBe(tokens.refreshTokenExpiresAt);
    expect(expiry!.value).toBe(String(Date.parse(tokens.accessTokenExpiresAt)));
  });

  it('refreshes when the access token is missing, invalid or about to expire', () => {
    const now = Date.parse('2030-01-01T00:00:00Z');
    expect(needsRefresh(undefined, undefined, now)).toBe(true);
    expect(needsRefresh('t', 'garbage', now)).toBe(true);
    expect(needsRefresh('t', String(now + 30_000), now)).toBe(true);
    expect(needsRefresh('t', String(now + 5 * 60_000), now)).toBe(false);
  });
});
