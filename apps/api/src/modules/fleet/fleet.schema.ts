import { integer, index, jsonb, pgTable, smallint, text, uuid } from 'drizzle-orm/pg-core';
import type { LayoutSeat } from '@vtp/shared-types';
import { timestamps } from '../identity/identity.schema.js';
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
