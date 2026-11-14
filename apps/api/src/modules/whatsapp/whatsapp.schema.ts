import {
  index,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { timestamps, users } from '../identity/identity.schema.js';
import { taxiRideStatus, taxiRides } from '../taxi/taxi.schema.js';

/** Where a chat is in the menu (ADR-038). `human`: a person answers; the bot stays quiet. */
export const WHATSAPP_CHAT_STATES = [
  'menu',
  'taxi_mode',
  'taxi_from',
  'taxi_to',
  'taxi_address',
  'taxi_passengers',
  'taxi_confirm',
  'rate',
  'human',
] as const;
export type WhatsappChatState = (typeof WHATSAPP_CHAT_STATES)[number];

export const whatsappChatState = pgEnum('whatsapp_chat_state', WHATSAPP_CHAT_STATES);
export const whatsappDirection = pgEnum('whatsapp_direction', ['in', 'out']);
export const whatsappMessageStatus = pgEnum('whatsapp_message_status', [
  'received',
  'sent',
  'logged',
  'outside_window',
  'failed',
]);

/** What a chat is asking for while it goes through the taxi steps. */
export interface WhatsappDraft {
  mode?: 'car' | 'motorcycle';
  fromStopId?: string;
  toStopId?: string;
  address?: string;
  passengers?: number;
  /** `rate`: the ride being rated. */
  rideId?: string;
}

/**
 * One row per WhatsApp number that wrote to the platform. `last_inbound_at` opens Meta's free
 * 24-hour window; the platform only writes inside it, so it never pays for a message.
 */
export const whatsappChats = pgTable(
  'whatsapp_chats',
  {
    id: uuid().primaryKey().defaultRandom(),
    /** E.164, e.g. +584141234567. */
    phone: text().notNull().unique(),
    profileName: text(),
    /** The guest passenger who asks for rides from this chat (ADR-034), made on the first ride. */
    userId: uuid().references(() => users.id, { onDelete: 'set null' }),
    state: whatsappChatState().notNull().default('menu'),
    draft: jsonb().$type<WhatsappDraft>().notNull().default({}),
    lastInboundAt: timestamp({ withTimezone: true }).notNull(),
    /** While set and in the future, a person handles the chat. */
    humanUntil: timestamp({ withTimezone: true }),
    ...timestamps,
  },
  (t) => [index('whatsapp_chats_last_inbound_idx').on(t.lastInboundAt)],
);

/**
 * What came in and went out, kept briefly for support and to ignore Meta's repeated deliveries
 * (`wa_message_id`). Deleted after `RETENTION.whatsappMessagesDays`.
 */
export const whatsappMessages = pgTable(
  'whatsapp_messages',
  {
    id: uuid().primaryKey().defaultRandom(),
    chatId: uuid()
      .notNull()
      .references(() => whatsappChats.id, { onDelete: 'cascade' }),
    direction: whatsappDirection().notNull(),
    waMessageId: text().unique(),
    body: text().notNull(),
    status: whatsappMessageStatus().notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('whatsapp_messages_chat_idx').on(t.chatId, t.createdAt),
    index('whatsapp_messages_created_idx').on(t.createdAt),
  ],
);

/** Ride changes already told on WhatsApp: each status once per ride. */
export const whatsappRideNotices = pgTable(
  'whatsapp_ride_notices',
  {
    rideId: uuid()
      .notNull()
      .references(() => taxiRides.id, { onDelete: 'cascade' }),
    status: taxiRideStatus().notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.rideId, t.status] })],
);

export type WhatsappChatRow = typeof whatsappChats.$inferSelect;
