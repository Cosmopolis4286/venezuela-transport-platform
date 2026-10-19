import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../auth/auth-context';
import { ApiError } from './errors';

export interface ApiResource<T> {
  data?: T;
  error?: ApiError;
  loading: boolean;
  reload: () => Promise<void>;
  /** Replaces the data with a fresher copy, e.g. the response of a mutation. */
  mutate: (data: T) => void;
}

/**
 * GETs `path` and keeps the latest result. `null` skips the request. Sends the session's token
 * unless `auth: false` (public endpoints, usable while signed out).
 */
export function useApi<T>(path: string | null, options: { auth?: boolean } = {}): ApiResource<T> {
  const auth = options.auth ?? true;
  const { api } = useAuth();
  const [result, setResult] = useState<{ data?: T; error?: ApiError; loading: boolean }>({
    loading: path !== null,
  });

  const load = useCallback(async (): Promise<{ data?: T; error?: ApiError; loading: boolean }> => {
    if (path === null) return { loading: false };
    try {
      return { data: await api.request<T>(path, { auth }), loading: false };
    } catch (error) {
      const apiError =
        error instanceof ApiError ? error : new ApiError(0, 'INTERNAL_ERROR', String(error));
      return { error: apiError, loading: false };
    }
  }, [api, path, auth]);

  useEffect(() => {
    let active = true;
    void load().then((next) => {
      if (active) setResult(next);
    });
    return () => {
      active = false;
    };
  }, [load]);

  const reload = useCallback(async () => {
    setResult((current) => ({ ...current, loading: true }));
    const next = await load();
    // Keep showing the previous data if a background reload fails.
    setResult((current) =>
      next.error && current.data ? { ...current, loading: false, error: next.error } : next,
    );
  }, [load]);

  const mutate = useCallback((data: T) => setResult({ data, loading: false }), []);

  return { ...result, reload, mutate };
}
