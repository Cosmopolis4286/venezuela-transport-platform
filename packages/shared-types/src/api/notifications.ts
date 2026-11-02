import type { Locale } from '../i18n/locales.js';

/**
 * Notifications (ADR-026): push through the Expo push service to the apps, plus e-mail. Texts
 * live in `NOTIFICATION_MESSAGES`.
 */

/** Which app a device token belongs to; operators' notices only go to the transport app. */
export const PUSH_APPS = ['passenger', 'transport'] as const;
export type PushApp = (typeof PUSH_APPS)[number];

export const PUSH_PLATFORMS = ['ios', 'android', 'web'] as const;
export type PushPlatform = (typeof PUSH_PLATFORMS)[number];

/** Expo push tokens look like `ExponentPushToken[xxxxxxxx]` (or `ExpoPushToken[…]`). */
export const EXPO_PUSH_TOKEN_PATTERN = /^Expo(nent)?PushToken\[[A-Za-z0-9_-]{8,}\]$/;

/** `POST /me/push-devices` — registers (or moves to the caller) one device token. */
export interface RegisterPushDeviceRequest {
  token: string;
  app: PushApp;
  platform: PushPlatform;
  /** Language the notifications are written in for this person. */
  locale: Locale;
}

/** `DELETE /me/push-devices` — on sign-out, so the device stops getting this person's notices. */
export interface UnregisterPushDeviceRequest {
  token: string;
}

export const NOTIFICATION_KINDS = [
  'payment_confirmed',
  'booking_cancelled',
  'refund_sent',
  'trip_reminder',
  'trip_assigned',
  'taxi_accepted',
  'taxi_requested',
  'organization_reviewed',
  'application_reviewed',
  'application_decided',
  'invitation_received',
  'payment_rejected',
] as const;
export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];
