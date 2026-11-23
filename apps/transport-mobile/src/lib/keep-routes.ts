import { responseKey, type ApiClient } from '@vtp/mobile-core';
import type { Route, RouteSummary } from '@vtp/shared-types';
import { useEffect } from 'react';
import { AppState } from 'react-native';
import { responseCache } from './response-cache';

/**
 * Saves a line's published routes, with their stops and fares, as the cash sales screen reads
 * them, so a driver can record cash sales without signal (ADR-051). Without signal it simply
 * tries again when the app comes back to front.
 */
async function saveRoutes(api: ApiClient, organizationId: string): Promise<void> {
  const base = `/organizations/${organizationId}/routes`;
  const list = await api.request<RouteSummary[]>(base);
  responseCache.write(responseKey(base), list);
  for (const route of list.filter((r) => r.status === 'active')) {
    const path = `${base}/${route.id}`;
    responseCache.write(responseKey(path), await api.request<Route>(path));
  }
}

export function useKeepRoutesSaved(api: ApiClient, organizationId: string): void {
  useEffect(() => {
    const run = () => void saveRoutes(api, organizationId).catch(() => undefined);
    run();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') run();
    });
    return () => subscription.remove();
  }, [api, organizationId]);
}
