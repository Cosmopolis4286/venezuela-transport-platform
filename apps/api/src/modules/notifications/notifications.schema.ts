import { index, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { LOCALES, NOTIFICATION_KINDS, PUSH_APPS, PUSH_PLATFORMS } from '@vtp/shared-types';
import { users } from '../identity/identity.schema.js';

export const pushApp = pgEnum('push_app', PUSH_APPS);
export const pushPlatform = pgEnum('push_platform', PUSH_PLATFORMS);
export const notificationLocale = pgEnum('notification_locale', LOCALES);
export const notificationKind = pgEnum('notification_kind', NOTIFICATION_KINDS);
export const notificationChannel = pgEnum('notification_channel', ['push', 'email']);
export const notificationStatus = pgEnum('notification_status', ['sent', 'failed']);

/** A phone (or browser) where someone gets push notifications; one row per Expo token. */
export const pushDevices = pgTable(
  'push_devices',
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    token: text().notNull(),
    app: pushApp().notNull(),
    platform: pushPlatform().notNull(),
    locale: notificationLocale().notNull().default('es'),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // A token belongs to whoever signed in last on that device.
    uniqueIndex('push_devices_token_key').on(t.token),
    index('push_devices_user_idx').on(t.userId),
  ],
);

/** What was sent to whom, for support and to avoid repeats. Message bodies are not stored. */
export const notifications = pgTable(
  'notifications',
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    kind: notificationKind().notNull(),
    channel: notificationChannel().notNull(),
    status: notificationStatus().notNull(),
    /** The booking, trip or taxi ride it is about. */
    reference: text(),
    error: text(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('notifications_user_idx').on(t.userId, t.createdAt)],
);

export type PushDeviceRow = typeof pushDevices.$inferSelect;
