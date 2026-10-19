import type { AuthClient, AuthResponse, AuthTokens, UserProfile } from '@vtp/shared-types';
import type { TokenStore } from '../session/token-store';
import { ApiError } from './errors';

/** Refresh this long before the access token expires, so slow requests do not race the expiry. */
export const REFRESH_MARGIN_MS = 30_000;

export interface ApiClientOptions {
  /** Including the version prefix, e.g. `http://10.0.2.2:4000/api/v1`. */
  baseUrl: string;
  client: AuthClient;
  store: TokenStore;
  fetch?: typeof fetch;
  now?: () => number;
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  /** JSON body. */
  body?: unknown;
  /** Multipart body (file uploads). */
  form?: FormData;
  /** Send the session's bearer token (default true). */
  auth?: boolean;
}

/**
 * Talks to the API on behalf of one app installation.
 *
 * Refresh tokens rotate and the API revokes the whole session when an old one is replayed,
 * so refreshes are serialised: concurrent requests share a single in-flight refresh, and the
 * rotated tokens are persisted before any request uses them.
 */
export class ApiClient {
  private tokens: AuthTokens | null = null;
  private refreshing: Promise<AuthTokens | null> | null = null;
  private readonly sessionEndedListeners = new Set<() => void>();
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => number;

  constructor(private readonly options: ApiClientOptions) {
    this.fetchImpl = options.fetch ?? ((...args) => fetch(...args));
    this.now = options.now ?? Date.now;
  }

  get client(): AuthClient {
    return this.options.client;
  }

  /** Notified once when the API rejects the session (refresh token expired or revoked). */
  onSessionEnded(listener: () => void): () => void {
    this.sessionEndedListeners.add(listener);
    return () => this.sessionEndedListeners.delete(listener);
  }

  get hasSession(): boolean {
    return this.tokens !== null;
  }

  /** Loads a saved session. Returns false when there is none or it can no longer be refreshed. */
  async restore(): Promise<boolean> {
    this.tokens = await this.options.store.load();
    if (this.tokens && Date.parse(this.tokens.refreshTokenExpiresAt) <= this.now()) {
      await this.forget();
    }
    return this.tokens !== null;
  }

  /** Stores the tokens of a successful sign-in and returns the user. */
  async startSession(response: AuthResponse): Promise<UserProfile> {
    await this.options.store.save(response.tokens);
    this.tokens = response.tokens;
    return response.user;
  }

  /** Revokes the session on the API (best effort) and forgets it locally. */
  async endSession(): Promise<void> {
    if (this.tokens) {
      await this.request('/auth/logout', { method: 'POST' }).catch(() => undefined);
    }
    await this.forget();
  }

  async request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    const auth = options.auth ?? true;
    let accessToken = auth ? await this.validAccessToken() : null;
    let response = await this.send(path, options, accessToken);
    if (response.status === 401 && accessToken) {
      // The token may have been revoked or expired early (clock skew): refresh once and retry.
      accessToken = await this.refreshAfterRejection(accessToken);
      response = await this.send(path, options, accessToken);
      if (response.status === 401) await this.sessionEnded();
    }
    if (!response.ok) throw await ApiError.fromResponse(response);
    if (response.status === 204) return undefined as T;
    return (await response.json()) as T;
  }

  private async send(
    path: string,
    options: RequestOptions,
    accessToken: string | null,
  ): Promise<Response> {
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
    let body: BodyInit | undefined;
    if (options.form) {
      body = options.form; // fetch sets the multipart boundary itself
    } else if (options.body !== undefined) {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(options.body);
    }
    try {
      return await this.fetchImpl(`${this.options.baseUrl}${path}`, {
        method: options.method ?? (body ? 'POST' : 'GET'),
        headers,
        body,
      });
    } catch (cause) {
      throw ApiError.network(cause);
    }
  }

  private async validAccessToken(): Promise<string> {
    let tokens = this.tokens;
    if (!tokens) throw new ApiError(401, 'UNAUTHORIZED', 'Not signed in');
    if (Date.parse(tokens.accessTokenExpiresAt) - REFRESH_MARGIN_MS <= this.now()) {
      tokens = await this.refresh();
    }
    if (!tokens) throw new ApiError(401, 'SESSION_EXPIRED', 'Session expired');
    return tokens.accessToken;
  }

  private async refreshAfterRejection(rejected: string): Promise<string> {
    // Another request may already have rotated the tokens; do not rotate them twice.
    const tokens =
      this.tokens && this.tokens.accessToken !== rejected ? this.tokens : await this.refresh();
    if (!tokens) throw new ApiError(401, 'SESSION_EXPIRED', 'Session expired');
    return tokens.accessToken;
  }

  private refresh(): Promise<AuthTokens | null> {
    this.refreshing ??= this.runRefresh().finally(() => {
      this.refreshing = null;
    });
    return this.refreshing;
  }

  private async runRefresh(): Promise<AuthTokens | null> {
    const current = this.tokens;
    if (!current) return null;
    const response = await this.send(
      '/auth/refresh',
      { method: 'POST', body: { refreshToken: current.refreshToken } },
      null,
    );
    if (response.status === 401) {
      await this.sessionEnded();
      return null;
    }
    // Other failures (network, 5xx, rate limit) keep the session so the user can retry.
    if (!response.ok) throw await ApiError.fromResponse(response);
    const { tokens } = (await response.json()) as AuthResponse;
    await this.options.store.save(tokens);
    this.tokens = tokens;
    return tokens;
  }

  private async sessionEnded(): Promise<void> {
    const hadSession = this.tokens !== null;
    await this.forget();
    if (hadSession) this.sessionEndedListeners.forEach((listener) => listener());
  }

  private async forget(): Promise<void> {
    this.tokens = null;
    await this.options.store.clear();
  }
}
