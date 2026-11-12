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
import type { ApiClient } from '../api/client';
import { ApiError, userMessage } from '../api/errors';
import { currentLocale } from '../i18n/active-locale';
import { CORE_MESSAGES } from '../i18n/core-messages';
import { unregisterFromPush } from '../push/push-registration';

export type AuthState =
  | { status: 'loading' }
  /** A saved session exists but the API could not be reached to load the user. */
  | { status: 'unavailable'; message: string }
  | { status: 'signedOut'; notice?: string }
  | { status: 'signedIn'; user: UserProfile };

export interface AuthContextValue {
  state: AuthState;
  api: ApiClient;
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

/** Restores the saved session and loads the user it belongs to. */
async function loadSession(api: ApiClient): Promise<AuthState> {
  try {
    if (!api.hasSession && !(await api.restore())) return { status: 'signedOut' };
    return { status: 'signedIn', user: await api.request<UserProfile>('/me') };
  } catch (error) {
    return api.hasSession
      ? { status: 'unavailable', message: userMessage(error) }
      : { status: 'signedOut' };
  }
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ api, children }: { api: ApiClient; children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: 'loading' });

  const loadUser = useCallback(async () => setState(await loadSession(api)), [api]);

  useEffect(() => {
    let active = true;
    void loadSession(api).then((next) => {
      if (active) setState(next);
    });
    const unsubscribe = api.onSessionEnded(() =>
      setState({
        status: 'signedOut',
        notice: sharedMessages(currentLocale()).errors.SESSION_EXPIRED,
      }),
    );
    return () => {
      active = false;
      unsubscribe();
    };
  }, [api]);

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
        setState({
          status: 'signedOut',
          notice: CORE_MESSAGES[currentLocale()].legal.deleted,
        });
      },
      reload: async () => {
        if (state.status !== 'signedIn') return loadUser();
        // Errors propagate to the caller; a failed refresh never signs the user out by itself.
        setState({ status: 'signedIn', user: await api.request<UserProfile>('/me') });
      },
    }),
    [api, loadUser, signedIn, state],
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
