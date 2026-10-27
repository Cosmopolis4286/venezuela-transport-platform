import type { BookingStatus } from '@vtp/shared-types';

export const BOOKING_TONE: Record<BookingStatus, 'success' | 'warning' | 'danger' | 'neutral'> = {
  held: 'warning',
  confirmed: 'success',
  cancelled: 'neutral',
  expired: 'danger',
};
