import type { TripPackStatus } from '@vtp/shared-types';

export const PACK_TONE: Record<TripPackStatus, 'success' | 'warning' | 'danger' | 'neutral'> = {
  pending_payment: 'warning',
  active: 'success',
  exhausted: 'neutral',
  expired: 'danger',
  cancelled: 'neutral',
};
