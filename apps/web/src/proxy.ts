import type { AuthResponse } from '@vtp/shared-types';
import { NextResponse, type NextRequest } from 'next/server';
import { LOCALE_COOKIE, localeRoute } from './lib/locale-routing';
import { cookieNames, needsRefresh, sessionCookies } from './lib/server/cookies';
import { createDedupedRefresh } from './lib/server/refresh';

/**
 * Two jobs:
 * - Public pages: sends `/` and `/buscar` to the visitor's language (`/es`, `/en`, `/pt-br`) and
 *   remembers the language of every localized page visited.
 * - Signed-in areas: redirects to /login without a session and refreshes the access token shortly
 *   before it expires. Real authorization happens in the API on every call.
 */
const production = process.env.NODE_ENV === 'production';
const names = cookieNames(production);
const apiBase = (
  process.env.API_INTERNAL_BASE_URL ||
  process.env.NEXT_PUBLIC_API_BASE_URL ||
  ''
).replace(/\/+$/, '');

const refresh = createDedupedRefresh(async (refreshToken) => {
  const response = await fetch(`${apiBase}/auth/refresh`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
    cache: 'no-store',
  });
  return response.ok ? ((await response.json()) as AuthResponse) : null;
});

function toLogin(request: NextRequest, expired: boolean): NextResponse {
  const url = new URL('/login', request.url);
  url.searchParams.set('next', request.nextUrl.pathname);
  if (expired) url.searchParams.set('expired', '1');
  const response = NextResponse.redirect(url);
  for (const name of Object.values(names)) response.cookies.delete(name);
  return response;
}

const YEAR_SECONDS = 365 * 24 * 3600;

function localize(request: NextRequest): NextResponse {
  const route = localeRoute(
    request.nextUrl.pathname,
    request.cookies.get(LOCALE_COOKIE)?.value,
    request.headers.get('accept-language'),
  );
  if ('redirect' in route) {
    const url = request.nextUrl.clone();
    url.pathname = route.redirect;
    return NextResponse.redirect(url);
  }
  const response = NextResponse.next();
  if (request.cookies.get(LOCALE_COOKIE)?.value !== route.locale) {
    response.cookies.set(LOCALE_COOKIE, route.locale, {
      path: '/',
      sameSite: 'lax',
      secure: production,
      maxAge: YEAR_SECONDS,
    });
  }
  return response;
}

export async function proxy(request: NextRequest): Promise<NextResponse> {
  const { pathname } = request.nextUrl;
  if (!pathname.startsWith('/portal') && !pathname.startsWith('/admin')) return localize(request);

  const refreshToken = request.cookies.get(names.refresh)?.value;
  if (!refreshToken) return toLogin(request, false);

  const access = request.cookies.get(names.access)?.value;
  if (!needsRefresh(access, request.cookies.get(names.accessExpiry)?.value))
    return NextResponse.next();

  const renewed = await refresh(refreshToken).catch(() => null);
  if (!renewed) return toLogin(request, true);

  const cookies = sessionCookies(renewed.tokens, production);
  // Forward the new tokens to this render, and store them in the browser.
  for (const cookie of cookies) request.cookies.set(cookie.name, cookie.value);
  const response = NextResponse.next({ request: { headers: request.headers } });
  for (const cookie of cookies) response.cookies.set(cookie.name, cookie.value, cookie.options);
  return response;
}

export const config = {
  matcher: [
    '/portal/:path*',
    '/admin/:path*',
    '/',
    '/buscar',
    '/(es|en|pt-br)',
    '/(es|en|pt-br)/:path*',
  ],
};
