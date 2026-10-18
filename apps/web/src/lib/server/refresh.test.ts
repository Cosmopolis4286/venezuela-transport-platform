import type { AuthResponse } from '@vtp/shared-types';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createDedupedRefresh, resetRefreshCache } from './refresh';

const response = (n: number) =>
  ({ tokens: { refreshToken: `rt-${n}` } }) as unknown as AuthResponse;

describe('createDedupedRefresh', () => {
  beforeEach(() => resetRefreshCache());

  it('shares one API call between concurrent requests with the same refresh token', async () => {
    let calls = 0;
    const refresh = createDedupedRefresh(async () => response(++calls));
    const results = await Promise.all([refresh('rt-0'), refresh('rt-0'), refresh('rt-0')]);
    expect(calls).toBe(1);
    expect(new Set(results.map((r) => r?.tokens.refreshToken))).toEqual(new Set(['rt-1']));
  });

  it('reuses a recent result for late requests, then forgets it', async () => {
    let clock = 0;
    const api = vi.fn(async () => response(1));
    const refresh = createDedupedRefresh(api, () => clock);
    await refresh('rt-0');
    clock = 10_000;
    await refresh('rt-0');
    expect(api).toHaveBeenCalledTimes(1);
    clock = 45_000;
    await refresh('rt-0');
    expect(api).toHaveBeenCalledTimes(2);
  });

  it('keeps different sessions independent', async () => {
    const api = vi.fn(async (token: string) => response(token === 'a' ? 1 : 2));
    const refresh = createDedupedRefresh(api);
    await Promise.all([refresh('a'), refresh('b')]);
    expect(api).toHaveBeenCalledTimes(2);
  });
});
