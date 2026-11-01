import {
  boolean,
  date,
  integer,
  index,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  smallint,
  text,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { VEHICLE_DOCUMENT_KINDS, type LayoutSeat } from '@vtp/shared-types';
import { timestamps, users } from '../identity/identity.schema.js';
import { organizations } from '../organizations/organizations.schema.js';

/** Seat map of a type of vehicle an operator runs. Validated with `layoutProblem()`. */
export const seatLayouts = pgTable(
  'seat_layouts',
  {
    id: uuid().primaryKey().defaultRandom(),
    organizationId: uuid()
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    name: text().notNull(),
    decks: smallint().notNull(),
    rows: smallint().notNull(),
    columns: smallint().notNull(),
    seats: jsonb().$type<LayoutSeat[]>().notNull(),
    /** Denormalized `seats.length`, copied to the schedules that use the layout. */
    capacity: integer().notNull(),
    ...timestamps,
  },
  (t) => [index('seat_layouts_organization_idx').on(t.organizationId)],
);

export type SeatLayoutRow = typeof seatLayouts.$inferSelect;

/** A bus or car of an operator. Never deleted: deactivated vehicles keep their past trips. */
export const vehicles = pgTable(
  'vehicles',
  {
    id: uuid().primaryKey().defaultRandom(),
    organizationId: uuid()
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    /** `normalizePlate()`: upper case letters and digits. */
    plate: text().notNull(),
    label: text(),
    /** Set null if the layout is deleted (only possible while no schedule uses it). */
    seatLayoutId: uuid().references(() => seatLayouts.id, { onDelete: 'set null' }),
    active: boolean().notNull().default(true),
    ...timestamps,
  },
  (t) => [uniqueIndex('vehicles_organization_plate_key').on(t.organizationId, t.plate)],
);

export type VehicleRow = typeof vehicles.$inferSelect;

export const vehicleDocumentKind = pgEnum('vehicle_document_kind', VEHICLE_DOCUMENT_KINDS);

/** One paper of a vehicle (registration, insurance, transport permit) and its last valid day. */
export const vehicleDocuments = pgTable(
  'vehicle_documents',
  {
    vehicleId: uuid()
      .notNull()
      .references(() => vehicles.id, { onDelete: 'cascade' }),
    kind: vehicleDocumentKind().notNull(),
    number: text().notNull(),
    expiresOn: date({ mode: 'string' }).notNull(),
    updatedByUserId: uuid().references(() => users.id, { onDelete: 'set null' }),
    ...timestamps,
  },
  (t) => [primaryKey({ columns: [t.vehicleId, t.kind] })],
);

export type VehicleDocumentRow = typeof vehicleDocuments.$inferSelect;
