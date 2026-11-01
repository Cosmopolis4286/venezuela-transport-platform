import {
  sharedMessages,
  type AuthResponse,
  type OtpChallengeResponse,
  type OtpChannel,
  type RegisterRequest,
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
  register(input: Omit<RegisterRequest, 'client'>): Promise<void>;
  signOut(): Promise<void>;
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

  const signedIn = useCallback(
    async (response: AuthResponse) => {
      setState({ status: 'signedIn', user: await api.startSession(response) });
    },
    [api],
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
            body: { challengeId, code, client: api.client },
          }),
        ),
      signInWithPassword: async (email, password) =>
        signedIn(
          await api.request<AuthResponse>('/auth/login', {
            auth: false,
            body: { email, password, client: api.client },
          }),
        ),
      register: async (input) =>
        signedIn(
          await api.request<AuthResponse>('/auth/register', {
            auth: false,
            body: { ...input, client: api.client },
          }),
        ),
      signOut: async () => {
        await unregisterFromPush(api);
        await api.endSession();
        setState({ status: 'signedOut' });
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
