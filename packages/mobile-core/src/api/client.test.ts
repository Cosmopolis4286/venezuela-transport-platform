import type { AuthResponse, AuthTokens } from '@vtp/shared-types';
import { describe, expect, it, vi } from 'vitest';
import { memoryTokenStore, parseStoredTokens } from '../session/token-store';
import { ApiClient, REFRESH_MARGIN_MS } from './client';
import { ApiError } from './errors';

const NOW = Date.parse('2026-10-18T12:00:00Z');
const iso = (offsetMs: number) => new Date(NOW + offsetMs).toISOString();

const tokens = (n: number, accessTtlMs = 15 * 60_000): AuthTokens => ({
  tokenType: 'Bearer',
  accessToken: `access-${n}`,
  accessTokenExpiresAt: iso(accessTtlMs),
  refreshToken: `refresh-${n}`,
  refreshTokenExpiresAt: iso(30 * 24 * 3600_000),
});

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

const apiError = (status: number, code: string) =>
  json(status, { error: { code, message: code, timestamp: iso(0) } });

/** Fake API: `/auth/refresh` rotates tokens, `/me` accepts only the latest access token. */
function fakeApi(start: AuthTokens) {
  let current = start;
  let generation = 1;
  const calls: string[] = [];
  const fetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    const path = String(url).replace('http://api.test/api/v1', '');
    calls.push(path);
    await Promise.resolve();
    if (path === '/auth/refresh') {
      const { refreshToken } = JSON.parse(String(init?.body)) as { refreshToken: string };
      if (refreshToken !== current.refreshToken) return apiError(401, 'SESSION_EXPIRED');
      current = tokens(++generation);
      return json(200, { user: { id: 'u1' }, tokens: current } as AuthResponse);
    }
    const authorization = new Headers(init?.headers).get('Authorization');
    if (authorization !== `Bearer ${current.accessToken}`) return apiError(401, 'UNAUTHORIZED');
    if (path === '/auth/logout') return new Response(null, { status: 204 });
    return json(200, { ok: true, path });
  });
  return {
    fetch,
    calls,
    revoke: () => {
      current = tokens(999);
    },
  };
}

const makeClient = (initial: AuthTokens | null, api: ReturnType<typeof fakeApi>) => {
  const store = memoryTokenStore(initial);
  const onSessionEnded = vi.fn();
  const client = new ApiClient({
    baseUrl: 'http://api.test/api/v1',
    client: 'transport',
    store,
    fetch: api.fetch as typeof fetch,
    now: () => NOW,
  });
  client.onSessionEnded(onSessionEnded);
  return { client, store, onSessionEnded };
};

describe('ApiClient', () => {
  it('sends the bearer token and parses JSON', async () => {
    const api = fakeApi(tokens(1));
    const { client } = makeClient(tokens(1), api);
    await client.restore();
    await expect(client.request('/me')).resolves.toEqual({ ok: true, path: '/me' });
    expect(api.calls).toEqual(['/me']);
  });

  it('refreshes a token about to expire once, even for parallel requests, and persists it', async () => {
    const stale = tokens(1, REFRESH_MARGIN_MS - 1);
    const api = fakeApi(stale);
    const { client, store } = makeClient(stale, api);
    await client.restore();

    const results = await Promise.all([1, 2, 3, 4, 5].map(() => client.request('/me')));
    expect(results).toHaveLength(5);
    expect(api.calls.filter((c) => c === '/auth/refresh')).toHaveLength(1);
    expect((await store.load())?.accessToken).toBe('access-2');
  });

  it('retries a rejected token once through a refresh, then ends the revoked session', async () => {
    const api = fakeApi(tokens(1));
    const { client, onSessionEnded } = makeClient(tokens(1), api);
    await client.restore();
    api.revoke(); // e.g. signed out from another device

    await expect(client.request('/me')).rejects.toMatchObject({ code: 'SESSION_EXPIRED' });
    expect(api.calls).toEqual(['/me', '/auth/refresh']);
    expect(client.hasSession).toBe(false);
    expect(onSessionEnded).toHaveBeenCalledTimes(1);
  });

  it('ends the session and notifies once when the refresh token is rejected', async () => {
    const stale = tokens(1, 0);
    const api = fakeApi(stale);
    const { client, store, onSessionEnded } = makeClient(stale, api);
    await client.restore();
    api.revoke();

    const outcomes = await Promise.allSettled([client.request('/me'), client.request('/me')]);
    expect(outcomes.every((o) => o.status === 'rejected')).toBe(true);
    expect(onSessionEnded).toHaveBeenCalledTimes(1);
    expect(await store.load()).toBeNull();
  });

  it('keeps the session when the refresh fails for a transient reason', async () => {
    const stale = tokens(1, 0);
    const api = fakeApi(stale);
    api.fetch.mockImplementationOnce(async () => apiError(503, 'SERVICE_UNAVAILABLE'));
    const { client, onSessionEnded } = makeClient(stale, api);
    await client.restore();

    await expect(client.request('/me')).rejects.toMatchObject({ code: 'SERVICE_UNAVAILABLE' });
    expect(client.hasSession).toBe(true);
    expect(onSessionEnded).not.toHaveBeenCalled();
    await expect(client.request('/me')).resolves.toMatchObject({ ok: true });
  });

  it('discards a saved session whose refresh token has expired', async () => {
    const expired = { ...tokens(1), refreshTokenExpiresAt: iso(-1) };
    const { client, store } = makeClient(expired, fakeApi(expired));
    await expect(client.restore()).resolves.toBe(false);
    expect(await store.load()).toBeNull();
  });

  it('maps network failures and API errors to Spanish messages', async () => {
    const api = fakeApi(tokens(1));
    api.fetch.mockRejectedValueOnce(new TypeError('Network request failed'));
    const { client } = makeClient(tokens(1), api);
    await client.restore();
    const error = (await client.request('/me').catch((e: unknown) => e)) as ApiError;
    expect(error.code).toBe('NETWORK');
    expect(error.userMessage).toMatch(/conexión/);

    api.fetch.mockResolvedValueOnce(
      json(400, {
        error: {
          code: 'VALIDATION_FAILED',
          message: 'Invalid',
          details: [{ field: 'birthDate', message: 'birthDate must be a date' }],
          timestamp: iso(0),
        },
      }),
    );
    const validation = (await client.request('/me').catch((e: unknown) => e)) as ApiError;
    expect(validation.userMessage).toBe('birthDate must be a date');
  });

  it('logs out on the API and forgets the tokens', async () => {
    const api = fakeApi(tokens(1));
    const { client, store } = makeClient(tokens(1), api);
    await client.restore();
    await client.endSession();
    expect(api.calls).toEqual(['/auth/logout']);
    expect(await store.load()).toBeNull();
  });
});

describe('parseStoredTokens', () => {
  it('ignores corrupt or incomplete entries', () => {
    expect(parseStoredTokens(null)).toBeNull();
    expect(parseStoredTokens('{nope')).toBeNull();
    expect(parseStoredTokens('{"accessToken":"a"}')).toBeNull();
    expect(parseStoredTokens(JSON.stringify(tokens(1)))).toEqual(tokens(1));
  });
});
