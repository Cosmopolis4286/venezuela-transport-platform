import { sql } from 'drizzle-orm';
import {
  index,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { ORGANIZATION_ROLES, ORGANIZATION_STATUSES, ORGANIZATION_TYPES } from '@vtp/shared-types';
import { timestamps, users } from '../identity/identity.schema.js';

export const organizationType = pgEnum('organization_type', ORGANIZATION_TYPES);
export const organizationStatus = pgEnum('organization_status', ORGANIZATION_STATUSES);
export const organizationRole = pgEnum('organization_role', ORGANIZATION_ROLES);
export const contactKind = pgEnum('contact_kind', ['email', 'phone']);
export const invitationStatus = pgEnum('invitation_status', [
  'pending',
  'accepted',
  'declined',
  'revoked',
]);

/** Bus companies, taxi lines and terminals. */
export const organizations = pgTable(
  'organizations',
  {
    id: uuid().primaryKey().defaultRandom(),
    type: organizationType().notNull(),
    legalName: text().notNull(),
    tradeName: text(),
    /** Normalized `J-12345678-9`. */
    rif: text().notNull(),
    status: organizationStatus().notNull().default('pending_review'),
    phone: text(),
    email: text(),
    state: text(),
    city: text(),
    createdBy: uuid().references(() => users.id, { onDelete: 'set null' }),
    reviewedBy: uuid().references(() => users.id, { onDelete: 'set null' }),
    reviewedAt: timestamp({ withTimezone: true }),
    reviewNotes: text(),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('organizations_rif_key').on(t.rif),
    index('organizations_status_idx').on(t.status),
  ],
);

/** One role per person per organization. */
export const memberships = pgTable(
  'organization_memberships',
  {
    organizationId: uuid()
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: organizationRole().notNull(),
    invitedBy: uuid().references(() => users.id, { onDelete: 'set null' }),
    ...timestamps,
  },
  (t) => [
    primaryKey({ columns: [t.organizationId, t.userId] }),
    index('organization_memberships_user_idx').on(t.userId),
  ],
);

/**
 * Addressed to an e-mail or phone, not to a link: the invitee accepts after signing in with that
 * contact verified, so a forwarded or intercepted message is useless to anyone else.
 */
export const invitations = pgTable(
  'organization_invitations',
  {
    id: uuid().primaryKey().defaultRandom(),
    organizationId: uuid()
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    contactKind: contactKind().notNull(),
    /** Normalized: E.164 phone or lower-case e-mail. */
    destination: text().notNull(),
    role: organizationRole().notNull(),
    status: invitationStatus().notNull().default('pending'),
    invitedBy: uuid().references(() => users.id, { onDelete: 'set null' }),
    acceptedBy: uuid().references(() => users.id, { onDelete: 'set null' }),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    respondedAt: timestamp({ withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // At most one open invitation per person per organization.
    uniqueIndex('organization_invitations_pending_key')
      .on(t.organizationId, t.destination)
      .where(sql`${t.status} = 'pending'`),
    index('organization_invitations_destination_idx').on(t.destination, t.status),
  ],
);

export type OrganizationRow = typeof organizations.$inferSelect;
export type MembershipRow = typeof memberships.$inferSelect;
export type InvitationRow = typeof invitations.$inferSelect;
