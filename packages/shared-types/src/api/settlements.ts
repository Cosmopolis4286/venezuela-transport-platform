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

/**
 * Refund when a passenger cancels a paid booking: `percent` of the fare back when they cancel at
 * least `hoursBefore` hours before boarding. Tiers go from the earliest to the latest; after the
 * last one nothing is refunded. The platform keeps its commission (ADR-025).
 */
export interface RefundTier {
  /** Whole hours or quarters of an hour (0.5 = 30 minutes). */
  hoursBefore: number;
  percent: number;
}

export const MAX_REFUND_TIERS = 4;

/** 100 % up to 48 h before, 50 % up to 2 h before, nothing after. */
export const DEFAULT_REFUND_TIERS: readonly RefundTier[] = [
  { hoursBefore: 48, percent: 100 },
  { hoursBefore: 2, percent: 50 },
];

/**
 * Suburban routes (decided by the product owner): 100 % up to 24 h before, 75 % up to 2 h, 50 % up
 * to 30 minutes, and nothing in the last 30 minutes.
 */
export const DEFAULT_SUBURBAN_REFUND_TIERS: readonly RefundTier[] = [
  { hoursBefore: 24, percent: 100 },
  { hoursBefore: 2, percent: 75 },
  { hoursBefore: 0.5, percent: 50 },
];

/** "48 h", "2 h", "30 min", "1 h 30 min" */
export function formatHoursBefore(hours: number): string {
  const total = Math.round(hours * 60);
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (!h) return `${m} min`;
  return m ? `${h} h ${m} min` : `${h} h`;
}

/**
 * Why a list of tiers is invalid, or null: 1–4 tiers, hours in quarters of an hour (0–720)
 * strictly decreasing.
 */
export function refundTiersProblem(tiers: readonly RefundTier[]): string | null {
  if (tiers.length < 1 || tiers.length > MAX_REFUND_TIERS) return 'Use between 1 and 4 tiers';
  for (const [i, tier] of tiers.entries()) {
    if (!Number.isInteger(tier.hoursBefore * 4) || tier.hoursBefore < 0 || tier.hoursBefore > 720)
      return 'hoursBefore must be between 0 and 720 hours, in quarters of an hour (0.5 = 30 min)';
    if (!Number.isInteger(tier.percent) || tier.percent < 0 || tier.percent > 100)
      return 'percent must be a whole number between 0 and 100';
    if (i > 0 && tier.hoursBefore >= tiers[i - 1]!.hoursBefore)
      return 'Tiers must go from the most hours before departure to the fewest';
  }
  return null;
}

/** Percent of the fare refunded when cancelling `hoursLeft` hours before boarding. */
export function refundPercentFor(tiers: readonly RefundTier[], hoursLeft: number): number {
  if (hoursLeft <= 0) return 0;
  return tiers.find((tier) => hoursLeft >= tier.hoursBefore)?.percent ?? 0;
}

/**
 * Who receives passengers' payments for an operator (ADR-027). `platform` (default): the
 * platform's accounts; it pays the operator what it earned. `operator`: the operator's own
 * accounts; it verifies its payments, sends its refunds and owes the platform its commission.
 */
export const PAYMENT_COLLECTIONS = ['platform', 'operator'] as const;
export type PaymentCollection = (typeof PAYMENT_COLLECTIONS)[number];

/** Commission and refund tiers in force (the platform's, or an operator's own). */
export interface SettlementPolicy {
  /** Percentage, e.g. `"8.00"`. */
  commissionRate: string;
  /** Intercity routes; an operator can have its own (`SetOrganizationPolicyRequest`). */
  refundTiers: RefundTier[];
  /** Suburban routes, for every operator (ADR-028). */
  suburbanRefundTiers: RefundTier[];
}

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
  /** Fares the operator received directly in its own accounts (minus what it refunded). */
  collected: string;
  /** Payouts made (voided ones excluded). */
  paidOut: string;
  /** What the operator paid the platform (its commission on what it collected). */
  received: string;
  /**
   * `earned - collected - paidOut + received`: still owed to the operator, or, when negative,
   * what the operator owes the platform.
   */
  balance: string;
}

export interface OrganizationSettlement {
  organizationId: string;
  /** Commission applied to new bookings: the override, or the platform default. */
  commissionRate: string;
  /** Set by platform staff for this operator; null when the default applies. */
  commissionOverride: string | null;
  /** Refund tiers applied to this operator's cancellations, and its own ones if any. */
  refundTiers: RefundTier[];
  refundTiersOverride: RefundTier[] | null;
  /** The platform's tiers for suburban routes (operators have no override). */
  suburbanRefundTiers: RefundTier[];
  /** Who receives this operator's passengers' payments. */
  paymentCollection: PaymentCollection;
  /** One per currency with activity, USD first. */
  balances: SettlementBalance[];
}

/** One paid booking in an operator's ledger; its amounts are frozen at confirmation. */
export interface SettlementEntry {
  id: string;
  bookingId: string;
  /** `cancellation` entries are negative: the refund taken back when a passenger cancelled. */
  kind: 'booking' | 'cancellation';
  /** Who received the passenger's money. */
  collectedBy: PaymentCollection;
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

/** `to_operator`: the platform paid the operator. `from_operator`: the operator paid its commission. */
export const PAYOUT_DIRECTIONS = ['to_operator', 'from_operator'] as const;
export type PayoutDirection = (typeof PAYOUT_DIRECTIONS)[number];

export interface Payout {
  id: string;
  organizationId: string;
  direction: PayoutDirection;
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

/** `PUT /admin/settlement-policy` — the platform defaults. Omitting the suburban tiers keeps them. */
export type UpdateSettlementPolicyRequest = Omit<SettlementPolicy, 'suburbanRefundTiers'> & {
  suburbanRefundTiers?: RefundTier[];
};

/** The tiers that apply to a booking of a route of `service`. */
export function refundTiersForService(
  policy: Pick<SettlementPolicy, 'refundTiers' | 'suburbanRefundTiers'>,
  service: 'intercity' | 'suburban',
): RefundTier[] {
  return service === 'suburban' ? policy.suburbanRefundTiers : policy.refundTiers;
}

/** `PUT /admin/organizations/:id/policy` — null fields go back to the platform default. */
export interface SetOrganizationPolicyRequest {
  commissionRate: string | null;
  refundTiers: RefundTier[] | null;
  /** Omitted: unchanged. */
  paymentCollection?: PaymentCollection;
}

/**
 * `POST /admin/organizations/:id/payouts` — money sent to the operator (never more than it is
 * owed), or with `direction: from_operator` received from it (never more than it owes).
 */
export interface CreatePayoutRequest {
  direction?: PayoutDirection;
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
  /** Exactly one of the two is set. */
  bookingId: string | null;
  tripPackId: string | null;
  /** The booking's or the trip pack's code. */
  bookingCode: string;
  /** Null for trip packs: the platform sold them. */
  organization: { id: string; name: string } | null;
  payer: { name: string | null; email: string | null; phone: string | null };
  method: PaymentMethod;
  currency: PaymentCurrency;
  /** What was asked and what actually arrived. */
  amount: string;
  receivedAmount: string | null;
  /** What goes back: part of `amount` after a cancellation, else everything that arrived. */
  refundAmount: string;
  /** True when the passenger cancelled a paid booking (refund per the policy). */
  cancellation: boolean;
  reference: string;
  providerReference: string | null;
  createdAt: string;
}

// --- Passengers ----------------------------------------------------------------------------------

/**
 * `GET /me/bookings/:id/cancellation` — what cancelling a paid booking now would give back.
 * `cancellable` is false once the passenger boarded or the bus left.
 */
export interface CancellationQuote {
  cancellable: boolean;
  /** Hours from now until the passenger boards (negative once departed). */
  hoursBeforeDeparture: number;
  refundPercent: number;
  /** In the currency the passenger paid with; null when nothing is refunded. */
  refund: { amount: string; currency: PaymentCurrency } | null;
  policy: RefundTier[];
}

/** `POST /admin/refunds/:paymentId` — the reference of the transfer that sent the money back. */
export interface MarkRefundedRequest {
  reference: string;
}
