import {
  LEGAL_VERSION,
  sharedMessages,
  type AuthResponse,
  type OtpChallengeResponse,
  type OtpChannel,
  type RegisterRequest,
  type UpgradeGuestRequest,
  type UserProfile,
} from '@vtp/shared-types';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { AppState } from 'react-native';
import type { ApiClient } from '../api/client';
import { PROFILE_KEY, type ResponseCache } from '../api/response-cache';
import { ApiError, userMessage } from '../api/errors';
import { currentLocale } from '../i18n/active-locale';
import { CORE_MESSAGES } from '../i18n/core-messages';
import { unregisterFromPush } from '../push/push-registration';

export type AuthState =
  | { status: 'loading' }
  /** A saved session exists but the API could not be reached to load the user. */
  | { status: 'unavailable'; message: string }
  /**
   * `expired`: the API ended the session (not the person signing out); what the app keeps on the
   * phone for that account (e.g. saved tickets) stays.
   */
  | { status: 'signedOut'; notice?: string; expired?: boolean }
  /**
   * `offline`: no signal to load the session, so the app opened with the profile saved on the
   * phone (only with a `cache`, ADR-051); it keeps trying and leaves this state by itself.
   */
  | { status: 'signedIn'; user: UserProfile; offline?: boolean };

export interface AuthContextValue {
  state: AuthState;
  api: ApiClient;
  /** Where screens keep their last answers for no signal; null when the app passed none. */
  cache: ResponseCache | null;
  requestCode(channel: OtpChannel, destination: string): Promise<OtpChallengeResponse>;
  verifyCode(challengeId: string, code: string): Promise<void>;
  signInWithPassword(email: string, password: string): Promise<void>;
  /** E-mails a code to choose a new password (same answer for unknown e-mails). */
  forgotPassword(email: string): Promise<OtpChallengeResponse>;
  /** Sets the new password with that code and signs in. */
  resetPassword(challengeId: string, code: string, password: string): Promise<void>;
  /** Signs up; the screen made the person accept the Terms and Privacy Policy. */
  register(input: Omit<RegisterRequest, 'client' | 'acceptTerms'>): Promise<void>;
  /**
   * Buys without registering (passenger app, ADR-034): a guest account kept on this phone. The
   * screen showed that continuing accepts the Terms and Privacy Policy.
   */
  continueAsGuest(): Promise<void>;
  /** A guest registers with e-mail and password, keeping its trips. */
  upgradeGuest(input: UpgradeGuestRequest): Promise<void>;
  signOut(): Promise<void>;
  /** Accepts the current Terms and Privacy Policy. */
  acceptTerms(): Promise<void>;
  /** Deletes the account (the API refuses while something is pending) and signs out. */
  deleteAccount(): Promise<void>;
  /** Reloads the profile (e.g. after KYC approval); from `unavailable`, retries loading the session. */
  reload(): Promise<void>;
}

/** How often an app opened without signal tries to load the session again. */
const OFFLINE_RETRY_MS = 30_000;

/**
 * Restores the saved session and loads the user it belongs to. Without signal, opens with the
 * profile saved on the phone when the app keeps one.
 */
export async function loadSession(api: ApiClient, cache: ResponseCache | null): Promise<AuthState> {
  try {
    // A saved session that can no longer be refreshed ended by itself, not by signing out.
    if (!api.hasSession && !(await api.restore())) return { status: 'signedOut', expired: true };
    return { status: 'signedIn', user: await api.request<UserProfile>('/me') };
  } catch (error) {
    if (!api.hasSession) return { status: 'signedOut' };
    const saved = cache?.read<UserProfile>(PROFILE_KEY);
    if (saved && error instanceof ApiError && error.code === 'NETWORK') {
      return { status: 'signedIn', user: saved.value, offline: true };
    }
    return { status: 'unavailable', message: userMessage(error) };
  }
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({
  api,
  cache = null,
  children,
}: {
  api: ApiClient;
  /** Lets screens and the session work without signal (ADR-051). */
  cache?: ResponseCache | null;
  children: ReactNode;
}) {
  const [state, setState] = useState<AuthState>({ status: 'loading' });

  const loadUser = useCallback(async () => {
    const next = await loadSession(api, cache);
    // Still without signal: keep the same state (and the same user object) on screen.
    setState((current) =>
      current.status === 'signedIn' && current.offline && next.status === 'signedIn' && next.offline
        ? current
        : next,
    );
  }, [api, cache]);

  useEffect(() => {
    let active = true;
    void loadSession(api, cache).then((next) => {
      if (active) setState(next);
    });
    const unsubscribe = api.onSessionEnded(() =>
      setState({
        status: 'signedOut',
        notice: sharedMessages(currentLocale()).errors.SESSION_EXPIRED,
        expired: true,
      }),
    );
    return () => {
      active = false;
      unsubscribe();
    };
  }, [api, cache]);

  // The profile is kept to open without signal; another account first deletes what was kept.
  const user = state.status === 'signedIn' && !state.offline ? state.user : null;
  useEffect(() => {
    if (!cache || !user) return;
    if (cache.read<UserProfile>(PROFILE_KEY)?.value.id !== user.id) cache.clear();
    cache.write(PROFILE_KEY, user);
  }, [cache, user]);

  // Opened without signal: try again every 30 seconds and when the app comes back to front.
  const offline = state.status === 'signedIn' && state.offline === true;
  useEffect(() => {
    if (!offline) return;
    const retry = () => void loadUser();
    const timer = setInterval(retry, OFFLINE_RETRY_MS);
    const subscription = AppState.addEventListener('change', (next) => {
      if (next === 'active') retry();
    });
    return () => {
      clearInterval(timer);
      subscription.remove();
    };
  }, [offline, loadUser]);

  /**
   * Signs in with `response`. When this phone was a guest, its trips move to the account it signed
   * in to (the guest's token proves the phone bought them); a failure there never blocks sign-in.
   */
  const signedIn = useCallback(
    async (response: AuthResponse) => {
      const guestToken =
        state.status === 'signedIn' && state.user.guest && !response.user.guest
          ? await api.accessToken()
          : null;
      const user = await api.startSession(response);
      if (guestToken && user.id !== (state.status === 'signedIn' ? state.user.id : null)) {
        await api
          .request('/me/claim-guest', { body: { guestAccessToken: guestToken } })
          .catch(() => undefined);
      }
      setState({ status: 'signedIn', user });
    },
    [api, state],
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      state,
      api,
      cache,
      requestCode: (channel, destination) =>
        api.request<OtpChallengeResponse>('/auth/otp/request', {
          auth: false,
          body: { channel, destination },
        }),
      verifyCode: async (challengeId, code) =>
        signedIn(
          await api.request<AuthResponse>('/auth/otp/verify', {
            auth: false,
            body: { challengeId, code, client: api.client, acceptTerms: true },
          }),
        ),
      signInWithPassword: async (email, password) =>
        signedIn(
          await api.request<AuthResponse>('/auth/login', {
            auth: false,
            body: { email, password, client: api.client },
          }),
        ),
      forgotPassword: (email) =>
        api.request<OtpChallengeResponse>('/auth/password/forgot', {
          auth: false,
          body: { email },
        }),
      resetPassword: async (challengeId, code, password) =>
        signedIn(
          await api.request<AuthResponse>('/auth/password/reset', {
            auth: false,
            body: { challengeId, code, password, client: api.client },
          }),
        ),
      register: async (input) =>
        signedIn(
          await api.request<AuthResponse>('/auth/register', {
            auth: false,
            body: { ...input, client: api.client, acceptTerms: true },
          }),
        ),
      continueAsGuest: async () =>
        signedIn(
          await api.request<AuthResponse>('/auth/guest', {
            auth: false,
            body: { client: api.client, acceptTerms: true },
          }),
        ),
      upgradeGuest: async (input) => {
        const user = await api.request<UserProfile>('/me/account', { body: input });
        setState({ status: 'signedIn', user });
      },
      signOut: async () => {
        await unregisterFromPush(api);
        await api.endSession();
        cache?.clear();
        setState({ status: 'signedOut' });
      },
      acceptTerms: async () => {
        const user = await api.request<UserProfile>('/me/terms', {
          body: { version: LEGAL_VERSION },
        });
        setState({ status: 'signedIn', user });
      },
      deleteAccount: async () => {
        await api.request('/me', { method: 'DELETE' });
        await api.endSession();
        cache?.clear();
        setState({
          status: 'signedOut',
          notice: CORE_MESSAGES[currentLocale()].legal.deleted,
        });
      },
      reload: async () => {
        if (state.status !== 'signedIn' || state.offline) return loadUser();
        // Errors propagate to the caller; a failed refresh never signs the user out by itself.
        setState({ status: 'signedIn', user: await api.request<UserProfile>('/me') });
      },
    }),
    [api, cache, loadUser, signedIn, state],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside <AuthProvider>');
  return value;
}

/** The signed-in user; only call from screens behind the signed-in guard. */
export function useCurrentUser(): UserProfile {
  const { state } = useAuth();
  if (state.status !== 'signedIn') throw new ApiError(401, 'UNAUTHORIZED', 'Not signed in');
  return state.user;
}
