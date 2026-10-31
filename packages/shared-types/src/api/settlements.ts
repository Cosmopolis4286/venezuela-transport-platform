import type { Currency } from './network.js';
import type { OrganizationType } from './organizations.js';
import type { PaymentCurrency, PaymentMethod } from './payments.js';

/**
 * Settlements (ADR-018, step 4). Every paid booking earns its operator the fare minus the
 * platform commission, in the fare's currency. Platform staff record the payouts they make; the
 * balance is what the platform still owes, per currency.
 */

/** Commission as a percentage with up to two decimals, e.g. `"8.50"`. */
export const COMMISSION_PATTERN = /^(100(\.0{1,2})?|\d{1,2}(\.\d{1,2})?)$/;

export const PAYOUT_METHODS = ['bank_transfer', 'pago_movil', 'usdt'] as const;
export type PayoutMethod = (typeof PAYOUT_METHODS)[number];

export const PAYOUT_METHOD_LABELS: Record<PayoutMethod, string> = {
  bank_transfer: 'Transferencia bancaria',
  pago_movil: 'Pago móvil',
  usdt: 'USDT',
};

/** What the platform owes an operator in one currency. Amounts are decimals with two places. */
export interface SettlementBalance {
  currency: Currency;
  /** Fares of paid bookings. */
  gross: string;
  commission: string;
  /** `gross - commission`. */
  earned: string;
  /** Payouts made (voided ones excluded). */
  paidOut: string;
  /** `earned - paidOut`: still owed to the operator. */
  balance: string;
}

export interface OrganizationSettlement {
  organizationId: string;
  /** Commission applied to new bookings: the override, or the platform default. */
  commissionRate: string;
  /** Set by platform staff for this operator; null when the default applies. */
  commissionOverride: string | null;
  /** One per currency with activity, USD first. */
  balances: SettlementBalance[];
}

/** One paid booking in an operator's ledger; its amounts are frozen at confirmation. */
export interface SettlementEntry {
  id: string;
  bookingId: string;
  bookingCode: string;
  route: { id: string; name: string };
  serviceDate: string;
  seats: number;
  currency: Currency;
  gross: string;
  commissionRate: string;
  commission: string;
  earned: string;
  createdAt: string;
}

export interface Payout {
  id: string;
  organizationId: string;
  currency: Currency;
  amount: string;
  method: PayoutMethod;
  /** Bank or wallet reference of the transfer. */
  reference: string;
  note: string | null;
  createdAt: string;
  /** Voided payouts do not count against the balance. */
  voidedAt: string | null;
  voidReason: string | null;
}

/** `GET /organizations/:id/settlement/entries?month=YYYY-MM` (Venezuelan calendar month). */
export interface SettlementEntriesQuery {
  month?: string;
}

// --- Platform staff ----------------------------------------------------------------------------

/** One row of `GET /admin/settlements`: every operator with activity or a commission override. */
export interface AdminSettlementSummary extends OrganizationSettlement {
  organization: { id: string; name: string; type: OrganizationType };
}

/** `PUT /admin/organizations/:id/commission` — null goes back to the platform default. */
export interface SetCommissionRequest {
  rate: string | null;
}

/** `POST /admin/organizations/:id/payouts` */
export interface CreatePayoutRequest {
  currency: Currency;
  amount: string;
  method: PayoutMethod;
  reference: string;
  note?: string;
}

/** `POST /admin/payouts/:id/void` */
export interface VoidPayoutRequest {
  reason: string;
}

/** A payment whose money must go back to the payer (`GET /admin/refunds`). */
export interface RefundDuePayment {
  paymentId: string;
  bookingId: string;
  bookingCode: string;
  organization: { id: string; name: string };
  payer: { name: string | null; email: string | null; phone: string | null };
  method: PaymentMethod;
  currency: PaymentCurrency;
  /** What was asked and what actually arrived. */
  amount: string;
  receivedAmount: string | null;
  reference: string;
  providerReference: string | null;
  createdAt: string;
}

/** `POST /admin/refunds/:paymentId` — the reference of the transfer that sent the money back. */
export interface MarkRefundedRequest {
  reference: string;
}
