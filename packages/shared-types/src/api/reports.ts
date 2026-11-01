import type { Currency } from './network.js';

/**
 * Reports (read-only). Dates are Venezuelan calendar days, `YYYY-MM-DD`, both ends included.
 * Sales come from the settlement ledger (what was paid, minus cancellations); occupancy from the
 * seats of each departure.
 */

/** Longest range one report covers. */
export const MAX_REPORT_DAYS = 366;

/** `?from=2026-10-01&to=2026-10-31`; both optional (the last 30 days by default). */
export interface ReportRangeQuery {
  from?: string;
  to?: string;
}

export interface SalesFigures {
  currency: Currency;
  /** Paid bookings (cancelled ones included: they were sold). */
  bookings: number;
  /** Seats sold minus seats cancelled. */
  seats: number;
  /** Fares paid minus refunds. */
  gross: string;
  commission: string;
  earned: string;
  /** Paid bookings cancelled by the passenger in the range. */
  cancellations: number;
  /** Fares given back for those cancellations. */
  refunded: string;
}

export interface SalesReport {
  from: string;
  to: string;
  /** One per currency with sales, USD first. */
  totals: SalesFigures[];
  byRoute: (SalesFigures & { route: { id: string; name: string } })[];
  /** Only days with movement, oldest first. */
  byDay: (SalesFigures & { date: string })[];
}

export interface DepartureOccupancy {
  tripId: string;
  route: { id: string; name: string };
  serviceDate: string;
  /** Departure from the route's origin (Venezuelan ISO timestamp). */
  departsAt: string;
  capacity: number;
  /** Seats in paid bookings. */
  soldSeats: number;
  /** Of those, how many boarded. */
  boardedSeats: number;
  /** soldSeats / capacity, whole percent. */
  occupancy: number;
}

export interface OccupancyReport {
  from: string;
  to: string;
  /** Departures with at least one booking, oldest first. */
  departures: DepartureOccupancy[];
  byRoute: {
    route: { id: string; name: string };
    departures: number;
    capacity: number;
    soldSeats: number;
    boardedSeats: number;
    occupancy: number;
  }[];
}

/** `GET /admin/metrics` — the whole platform in a range. */
export interface PlatformMetrics {
  from: string;
  to: string;
  sales: SalesFigures[];
  /** Refunds sent back by platform admins in the range, per payment currency. */
  refundsSent: { currency: string; count: number; amount: string }[];
  /** Waiting in the refund queue now. */
  refundsPending: number;
  newUsers: number;
  /** Organizations approved and active now, by type. */
  activeOrganizations: { bus_company: number; taxi_line: number; terminal: number };
  taxiRides: { requested: number; completed: number; cancelledOrExpired: number };
}
