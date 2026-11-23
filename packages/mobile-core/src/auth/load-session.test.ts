import type { UserProfile } from '@vtp/shared-types';
import { describe, expect, it, vi } from 'vitest';
import type { ApiClient } from '../api/client';
import { ApiError } from '../api/errors';
import { memoryResponseCache, PROFILE_KEY } from '../api/response-cache';
import { loadSession } from './auth-context';

vi.mock('react-native', () => ({ AppState: { addEventListener: vi.fn() } }));
vi.mock('../push/push-registration', () => ({ unregisterFromPush: vi.fn() }));

const user = { id: 'u1', name: 'Luis' } as unknown as UserProfile;

function fakeApi(answer: () => Promise<unknown>): ApiClient {
  return {
    hasSession: true,
    restore: async () => true,
    request: answer,
  } as unknown as ApiClient;
}

const noSignal = () => Promise.reject(new ApiError(0, 'NETWORK', 'Network request failed'));

describe('loadSession', () => {
  it('signs in with the profile from the API', async () => {
    expect(
      await loadSession(
        fakeApi(async () => user),
        memoryResponseCache(),
      ),
    ).toEqual({
      status: 'signedIn',
      user,
    });
  });

  it('opens with the saved profile when there is no signal', async () => {
    const cache = memoryResponseCache();
    cache.write(PROFILE_KEY, user);
    expect(await loadSession(fakeApi(noSignal), cache)).toEqual({
      status: 'signedIn',
      user,
      offline: true,
    });
  });

  it('needs signal without a saved profile, or when the API answers with an error', async () => {
    expect((await loadSession(fakeApi(noSignal), memoryResponseCache())).status).toBe(
      'unavailable',
    );
    expect((await loadSession(fakeApi(noSignal), null)).status).toBe('unavailable');
    const cache = memoryResponseCache();
    cache.write(PROFILE_KEY, user);
    const failing = () => Promise.reject(new ApiError(500, 'INTERNAL_ERROR', 'boom'));
    expect((await loadSession(fakeApi(failing), cache)).status).toBe('unavailable');
  });
});
