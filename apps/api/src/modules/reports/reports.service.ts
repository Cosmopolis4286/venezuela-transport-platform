import { HttpStatus, Injectable } from '@nestjs/common';
import {
  CURRENCIES,
  MAX_REPORT_DAYS,
  NETWORK_TIME_ZONE,
  NETWORK_UTC_OFFSET,
  toNetworkIso,
  todayInVenezuela,
  type Currency,
  type OccupancyReport,
  type PlatformMetrics,
  type SalesFigures,
  type SalesReport,
} from '@vtp/shared-types';
import { and, asc, eq, gte, lt, lte, sql, type SQL } from 'drizzle-orm';
import { ApiException } from '../../common/errors/api.exception.js';
import { DatabaseService } from '../../database/database.service.js';
import { bookingPassengers, bookings, trips } from '../bookings/bookings.schema.js';
import { users } from '../identity/identity.schema.js';
import { addDays } from '../network/departures.js';
import { routes } from '../network/network.schema.js';
import { organizations } from '../organizations/organizations.schema.js';
import { payments } from '../payments/payments.schema.js';
import { settlementEntries } from '../settlements/settlements.schema.js';
import { taxiRides } from '../taxi/taxi.schema.js';

const invalid = (message: string) =>
  new ApiException('VALIDATION_FAILED', message, HttpStatus.BAD_REQUEST);
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** A validated range of Venezuelan days and the instants that bound it: [start, end). */
export interface ReportRange {
  from: string;
  to: string;
  start: Date;
  end: Date;
}

/** `from`/`to` (`YYYY-MM-DD`, both included); the last 30 days by default. */
export function reportRange(from?: string, to?: string): ReportRange {
  const last = to ?? todayInVenezuela();
  const first = from ?? addDays(last, -29);
  for (const day of [first, last]) {
    if (!ISO_DATE.test(day) || Number.isNaN(Date.parse(`${day}T00:00:00Z`))) {
      throw invalid('Dates must look like 2026-10-31');
    }
  }
  const days = (Date.parse(`${last}T00:00:00Z`) - Date.parse(`${first}T00:00:00Z`)) / 86_400_000;
  if (days < 0) throw invalid('from must not be after to');
  if (days + 1 > MAX_REPORT_DAYS) throw invalid(`A report covers at most ${MAX_REPORT_DAYS} days`);
  return {
    from: first,
    to: last,
    start: new Date(`${first}T00:00:00${NETWORK_UTC_OFFSET}`),
    end: new Date(`${addDays(last, 1)}T00:00:00${NETWORK_UTC_OFFSET}`),
  };
}

const money = (value: SQL) => sql<string>`coalesce(${value}, 0)::numeric(14, 2)::text`;
const isBooking = sql`${settlementEntries.kind} = 'booking'`;
const isCancellation = sql`${settlementEntries.kind} = 'cancellation'`;

/** Aggregates of the settlement ledger, grouped by whatever the caller adds. */
const salesColumns = {
  currency: settlementEntries.currency,
  bookings: sql<number>`(count(*) filter (where ${isBooking}))::int`,
  seats: sql<number>`coalesce(sum(${settlementEntries.seats}), 0)::int`,
  gross: money(sql`sum(${settlementEntries.gross})`),
  commission: money(sql`sum(${settlementEntries.commission})`),
  earned: money(sql`sum(${settlementEntries.earned})`),
  cancellations: sql<number>`(count(*) filter (where ${isCancellation}))::int`,
  refunded: money(sql`-sum(${settlementEntries.gross}) filter (where ${isCancellation})`),
};

const byCurrency = <T extends { currency: Currency }>(rows: T[]): T[] =>
  [...rows].sort((a, b) => CURRENCIES.indexOf(a.currency) - CURRENCIES.indexOf(b.currency));

const percent = (part: number, whole: number) => (whole ? Math.round((part * 100) / whole) : 0);

/** Read-only reports from the ledger, the departures and the platform's activity. */
@Injectable()
export class ReportsService {
  constructor(private readonly database: DatabaseService) {}

  /** Sales of one operator: paid bookings minus cancellations, by currency, route and day. */
  async sales(organizationId: string, range: ReportRange): Promise<SalesReport> {
    const where = and(
      eq(settlementEntries.organizationId, organizationId),
      gte(settlementEntries.createdAt, range.start),
      lt(settlementEntries.createdAt, range.end),
    );
    const db = this.database.db;
    const totals = await db
      .select(salesColumns)
      .from(settlementEntries)
      .where(where)
      .groupBy(settlementEntries.currency);
    const byRoute = await db
      .select({ ...salesColumns, route: { id: routes.id, name: routes.name } })
      .from(settlementEntries)
      .innerJoin(bookings, eq(bookings.id, settlementEntries.bookingId))
      .innerJoin(trips, eq(trips.id, bookings.tripId))
      .innerJoin(routes, eq(routes.id, trips.routeId))
      .where(where)
      .groupBy(routes.id, routes.name, settlementEntries.currency)
      .orderBy(asc(routes.name));
    // The zone is a fixed constant written into the SQL (not a parameter), so the same expression
    // matches in SELECT and GROUP BY.
    const zone = sql.raw(`'${NETWORK_TIME_ZONE}'`);
    const day = sql<string>`to_char(${settlementEntries.createdAt} at time zone ${zone}, 'YYYY-MM-DD')`;
    const byDay = await db
      .select({ ...salesColumns, date: day })
      .from(settlementEntries)
      .where(where)
      .groupBy(day, settlementEntries.currency)
      .orderBy(asc(day));
    return {
      from: range.from,
      to: range.to,
      totals: byCurrency(totals as SalesFigures[]),
      byRoute: byRoute as SalesReport['byRoute'],
      byDay: byDay as SalesReport['byDay'],
    };
  }

  /** Seats sold and boarded on each departure of the range (by service date). */
  async occupancy(organizationId: string, range: ReportRange): Promise<OccupancyReport> {
    const sold = sql<number>`(count(${bookingPassengers.id}) filter (where ${bookings.status} = 'confirmed' and ${bookingPassengers.active}))::int`;
    const boarded = sql<number>`(count(${bookingPassengers.id}) filter (where ${bookingPassengers.boardedAt} is not null))::int`;
    const rows = await this.database.db
      .select({
        tripId: trips.id,
        route: { id: routes.id, name: routes.name },
        serviceDate: trips.serviceDate,
        departsAt: trips.departsAt,
        capacity: trips.capacity,
        soldSeats: sold,
        boardedSeats: boarded,
      })
      .from(trips)
      .innerJoin(routes, eq(routes.id, trips.routeId))
      .leftJoin(bookingPassengers, eq(bookingPassengers.tripId, trips.id))
      .leftJoin(bookings, eq(bookings.id, bookingPassengers.bookingId))
      .where(
        and(
          eq(trips.organizationId, organizationId),
          gte(trips.serviceDate, range.from),
          lte(trips.serviceDate, range.to),
        ),
      )
      .groupBy(trips.id, routes.id, routes.name)
      .orderBy(asc(trips.departsAt));
    const departures = rows
      .filter((r) => r.soldSeats > 0)
      .map((r) => ({
        ...r,
        departsAt: toNetworkIso(r.departsAt),
        occupancy: percent(r.soldSeats, r.capacity),
      }));
    const routesSeen = new Map<string, OccupancyReport['byRoute'][number]>();
    for (const d of departures) {
      const entry = routesSeen.get(d.route.id) ?? {
        route: d.route,
        departures: 0,
        capacity: 0,
        soldSeats: 0,
        boardedSeats: 0,
        occupancy: 0,
      };
      entry.departures += 1;
      entry.capacity += d.capacity;
      entry.soldSeats += d.soldSeats;
      entry.boardedSeats += d.boardedSeats;
      entry.occupancy = percent(entry.soldSeats, entry.capacity);
      routesSeen.set(d.route.id, entry);
    }
    return {
      from: range.from,
      to: range.to,
      departures,
      byRoute: [...routesSeen.values()].sort((a, b) =>
        a.route.name.localeCompare(b.route.name, 'es'),
      ),
    };
  }

  /** The whole platform in a range, for platform admins. */
  async platform(range: ReportRange): Promise<PlatformMetrics> {
    const db = this.database.db;
    const sales = await db
      .select(salesColumns)
      .from(settlementEntries)
      .where(
        and(
          gte(settlementEntries.createdAt, range.start),
          lt(settlementEntries.createdAt, range.end),
        ),
      )
      .groupBy(settlementEntries.currency);
    const refundsSent = await db
      .select({
        currency: payments.currency,
        count: sql<number>`count(*)::int`,
        amount: money(
          sql`sum(coalesce(${payments.refundAmount}, ${payments.receivedAmount}, ${payments.amount}))`,
        ),
      })
      .from(payments)
      .where(
        and(
          eq(payments.status, 'refunded'),
          gte(payments.refundedAt, range.start),
          lt(payments.refundedAt, range.end),
        ),
      )
      .groupBy(payments.currency)
      .orderBy(asc(payments.currency));
    const [pending] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(payments)
      .where(eq(payments.status, 'refund_due'));
    const [newUsers] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(users)
      .where(and(gte(users.createdAt, range.start), lt(users.createdAt, range.end)));
    const active = await db
      .select({ type: organizations.type, n: sql<number>`count(*)::int` })
      .from(organizations)
      .where(eq(organizations.status, 'active'))
      .groupBy(organizations.type);
    const [taxi] = await db
      .select({
        requested: sql<number>`count(*)::int`,
        completed: sql<number>`(count(*) filter (where ${taxiRides.status} = 'completed'))::int`,
        cancelledOrExpired: sql<number>`(count(*) filter (where ${taxiRides.status} in ('cancelled', 'expired')))::int`,
      })
      .from(taxiRides)
      .where(and(gte(taxiRides.createdAt, range.start), lt(taxiRides.createdAt, range.end)));
    const activeOf = (type: string) => active.find((a) => a.type === type)?.n ?? 0;
    return {
      from: range.from,
      to: range.to,
      sales: byCurrency(sales as SalesFigures[]),
      refundsSent,
      refundsPending: pending?.n ?? 0,
      newUsers: newUsers?.n ?? 0,
      activeOrganizations: {
        bus_company: activeOf('bus_company'),
        taxi_line: activeOf('taxi_line'),
        terminal: activeOf('terminal'),
      },
      taxiRides: taxi ?? { requested: 0, completed: 0, cancelledOrExpired: 0 },
    };
  }
}
