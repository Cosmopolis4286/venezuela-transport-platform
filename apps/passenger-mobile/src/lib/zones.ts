import { useApi } from '@vtp/mobile-core';
import type { OperatingZone } from '@vtp/shared-types';

/**
 * Zones that sell now (ADR-028): where trip packs and taxis or motorcycles by stretch are offered.
 * Empty until an admin activates one, so those options stay hidden.
 */
export function useSellingZones(): OperatingZone[] {
  const zones = useApi<OperatingZone[]>('/zones', { auth: false });
  return (zones.data ?? []).filter((z) => z.status === 'active');
}
