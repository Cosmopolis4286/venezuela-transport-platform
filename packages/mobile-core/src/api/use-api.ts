import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../auth/auth-context';
import { ApiError } from './errors';
import { responseKey } from './response-cache';

export interface ApiResource<T> {
  data?: T;
  error?: ApiError;
  loading: boolean;
  /**
   * Set when the API could not be reached and `data` is the copy saved on the phone at this time
   * (apps with a response cache, ADR-051).
   */
  savedAt?: string;
  reload: () => Promise<void>;
  /** Replaces the data with a fresher copy, e.g. the response of a mutation. */
  mutate: (data: T) => void;
}

type Result<T> = { data?: T; error?: ApiError; loading: boolean; savedAt?: string };

/**
 * GETs `path` and keeps the latest result. `null` skips the request. Sends the session's token
 * unless `auth: false` (public endpoints, usable while signed out). When the app has a response
 * cache, each answer is saved and shown again, with `savedAt`, when there is no signal.
 */
export function useApi<T>(path: string | null, options: { auth?: boolean } = {}): ApiResource<T> {
  const auth = options.auth ?? true;
  const { api, cache } = useAuth();
  const [result, setResult] = useState<Result<T>>({
    loading: path !== null,
  });

  const load = useCallback(async (): Promise<Result<T>> => {
    if (path === null) return { loading: false };
    const key = responseKey(path);
    try {
      const data = await api.request<T>(path, { auth });
      if (auth) cache?.write(key, data);
      return { data, loading: false };
    } catch (error) {
      const apiError =
        error instanceof ApiError ? error : new ApiError(0, 'INTERNAL_ERROR', String(error));
      const saved = auth && apiError.code === 'NETWORK' ? cache?.read<T>(key) : null;
      return saved
        ? { data: saved.value, error: apiError, loading: false, savedAt: saved.savedAt }
        : { error: apiError, loading: false };
    }
  }, [api, cache, path, auth]);

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
      next.error && current.data
        ? {
            ...current,
            loading: false,
            error: next.error,
            savedAt: next.savedAt ?? current.savedAt,
          }
        : next,
    );
  }, [load]);

  const mutate = useCallback((data: T) => setResult({ data, loading: false }), []);

  return { ...result, reload, mutate };
}
