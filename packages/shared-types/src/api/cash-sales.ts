import type { Currency } from './network.js';

/**
 * Cash sales (urban and suburban service): passengers who paid the driver in cash, recorded in the
 * transport app so reports count everyone who travelled. The money never passes through the
 * platform, so there is no service fee and nothing to settle.
 */

/** Most passengers one record can hold. */
export const MAX_CASH_PASSENGERS = 60;

/** `POST /organizations/:id/cash-sales`: the amount is the published fare × passengers. */
export interface CreateCashSaleRequest {
  routeId: string;
  fromStopId: string;
  toStopId: string;
  passengers: number;
}

export interface CashSale {
  id: string;
  route: { id: string; name: string };
  from: { id: string; name: string };
  to: { id: string; name: string };
  passengers: number;
  amount: string;
  currency: Currency;
  /** Venezuelan calendar day of the sale. */
  serviceDate: string;
  recordedAt: string;
  driver: { id: string; name: string };
  /** A mistaken record is voided (by whoever recorded it, the same day), never deleted. */
  voidedAt: string | null;
  voidReason: string | null;
}

export interface CashTotal {
  currency: Currency;
  passengers: number;
  amount: string;
}

/** `GET /organizations/:id/cash-sales/mine?date=`: what the driver recorded that day. */
export interface CashSalesDay {
  date: string;
  sales: CashSale[];
  /** Voided records left out. */
  totals: CashTotal[];
}

export interface VoidCashSaleRequest {
  reason: string;
}
