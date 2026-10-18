import { sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { AUTH_CLIENTS, OTP_CHANNELS, OTP_PURPOSES, PLATFORM_ROLES } from '@vtp/shared-types';
import { citext } from '../../database/column-types.js';

export const userStatus = pgEnum('user_status', ['active', 'suspended']);
export const authClient = pgEnum('auth_client', AUTH_CLIENTS);
export const otpChannel = pgEnum('otp_channel', OTP_CHANNELS);
export const otpPurpose = pgEnum('otp_purpose', OTP_PURPOSES);
export const platformRole = pgEnum('platform_role', PLATFORM_ROLES);

export const timestamps = {
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp({ withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};

export const users = pgTable(
  'users',
  {
    id: uuid().primaryKey().defaultRandom(),
    email: citext(),
    emailVerifiedAt: timestamp({ withTimezone: true }),
    /** E.164. */
    phone: text(),
    phoneVerifiedAt: timestamp({ withTimezone: true }),
    /** Null for passwordless (OTP-only) accounts. */
    passwordHash: text(),
    firstName: text(),
    lastName: text(),
    status: userStatus().notNull().default('active'),
    /** Platform staff only (granted with `pnpm platform:grant`); null for everyone else. */
    platformRole: platformRole(),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('users_email_key').on(t.email),
    uniqueIndex('users_phone_key').on(t.phone),
    check('users_contact_present', sql`${t.email} is not null or ${t.phone} is not null`),
  ],
);

/**
 * One row per signed-in device/app. Tokens are opaque; only their HMAC is stored.
 * Refreshing rotates both tokens; presenting the previous refresh token again means it was
 * stolen or replayed, so the whole session is revoked.
 */
export const sessions = pgTable(
  'sessions',
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    client: authClient().notNull(),
    accessTokenHash: text().notNull(),
    accessExpiresAt: timestamp({ withTimezone: true }).notNull(),
    refreshTokenHash: text().notNull(),
    previousRefreshTokenHash: text(),
    refreshExpiresAt: timestamp({ withTimezone: true }).notNull(),
    userAgent: text(),
    ip: text(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    lastUsedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    revokedAt: timestamp({ withTimezone: true }),
    revokedReason: text(),
  },
  (t) => [
    uniqueIndex('sessions_access_token_hash_key').on(t.accessTokenHash),
    uniqueIndex('sessions_refresh_token_hash_key').on(t.refreshTokenHash),
    index('sessions_previous_refresh_token_hash_idx').on(t.previousRefreshTokenHash),
    index('sessions_user_idx').on(t.userId),
  ],
);

export const otpChallenges = pgTable(
  'otp_challenges',
  {
    id: uuid().primaryKey().defaultRandom(),
    channel: otpChannel().notNull(),
    /** Normalized: E.164 phone or lower-case e-mail. */
    destination: text().notNull(),
    purpose: otpPurpose().notNull(),
    /** Set for `verify_contact`: the signed-in user who asked to verify this destination. */
    userId: uuid().references(() => users.id, { onDelete: 'cascade' }),
    codeHash: text().notNull(),
    attempts: integer().notNull().default(0),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    consumedAt: timestamp({ withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('otp_challenges_destination_created_idx').on(t.destination, t.createdAt)],
);

export type User = typeof users.$inferSelect;
export type Session = typeof sessions.$inferSelect;
export type OtpChallenge = typeof otpChallenges.$inferSelect;
