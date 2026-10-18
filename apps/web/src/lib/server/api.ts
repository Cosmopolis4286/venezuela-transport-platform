import 'server-only';
import { isApiErrorResponse, type ApiErrorCode, type ApiFieldError } from '@vtp/shared-types';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { errorMessage } from '../errors';
import { cookieNames } from './cookies';
import { apiBaseUrl, isProduction } from './env';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: ApiErrorCode | undefined,
    message: string,
    readonly details: ApiFieldError[] = [],
  ) {
    super(message);
  }

  /** Spanish, user-facing. */
  get userMessage(): string {
    return errorMessage(this.code, this.message);
  }
}

interface ApiRequest {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  /** Defaults to true: send the session's access token. */
  auth?: boolean;
  /** Override the token (e.g. right after login, before cookies reach the browser). */
  accessToken?: string;
}

async function accessTokenFromCookies(): Promise<string | undefined> {
  return (await cookies()).get(cookieNames(isProduction).access)?.value;
}

/** Raw call; throws ApiError on non-2xx. */
export async function apiRequest<T>(path: string, options: ApiRequest = {}): Promise<T> {
  const headers: Record<string, string> = { accept: 'application/json' };
  if (options.body !== undefined) headers['content-type'] = 'application/json';
  if (options.auth !== false) {
    const token = options.accessToken ?? (await accessTokenFromCookies());
    if (token) headers.authorization = `Bearer ${token}`;
  }
  const response = await fetch(`${apiBaseUrl}${path}`, {
    method: options.method ?? 'GET',
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    cache: 'no-store',
  });
  if (response.status === 204) return undefined as T;
  const body: unknown = await response.json().catch(() => undefined);
  if (!response.ok) {
    if (isApiErrorResponse(body)) {
      throw new ApiError(response.status, body.error.code, body.error.message, body.error.details);
    }
    throw new ApiError(response.status, undefined, `API error ${response.status}`);
  }
  return body as T;
}

/** For Server Components: on an expired session, send the user to sign in. */
export async function apiFetch<T>(path: string, options: ApiRequest = {}): Promise<T> {
  try {
    return await apiRequest<T>(path, options);
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) redirect('/login?expired=1');
    throw error;
  }
}

/** Streams a protected file from the API (documents). */
export async function apiFile(path: string): Promise<Response> {
  const token = await accessTokenFromCookies();
  return fetch(`${apiBaseUrl}${path}`, {
    headers: token ? { authorization: `Bearer ${token}` } : {},
    cache: 'no-store',
  });
}
