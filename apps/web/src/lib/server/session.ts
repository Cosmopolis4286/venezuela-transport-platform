import 'server-only';
import type { AuthResponse, UserProfile } from '@vtp/shared-types';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { apiFetch, apiRequest } from './api';
import { cookieNames, sessionCookies } from './cookies';
import { isProduction } from './env';

/** Only callable from Server Actions and Route Handlers (where cookies can be written). */
export async function startSession(response: AuthResponse): Promise<void> {
  const jar = await cookies();
  for (const cookie of sessionCookies(response.tokens, isProduction)) {
    jar.set(cookie.name, cookie.value, cookie.options);
  }
}

export async function endSession(): Promise<void> {
  const jar = await cookies();
  const hasAccess = jar.get(cookieNames(isProduction).access);
  if (hasAccess) await apiRequest('/auth/logout', { method: 'POST' }).catch(() => undefined);
  for (const name of Object.values(cookieNames(isProduction))) jar.delete(name);
}

/**
 * The signed-in user (Data Access Layer). Reads the session cookie, so callers must render inside
 * a <Suspense> boundary. Cached per browser for a short while to keep navigations instant.
 */
export async function getCurrentUser(): Promise<UserProfile> {
  'use cache: private';
  const jar = await cookies();
  if (!jar.get(cookieNames(isProduction).refresh)) redirect('/login');
  return apiFetch<UserProfile>('/me');
}

export async function requirePlatformStaff(): Promise<UserProfile> {
  const user = await getCurrentUser();
  if (!user.platformRole) redirect('/portal');
  return user;
}
