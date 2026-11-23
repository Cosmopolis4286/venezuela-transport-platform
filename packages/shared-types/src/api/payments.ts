import type { TripPackStatus } from './trip-packs.js';
import { DEFAULT_LOCALE, INTL_LOCALES, type Locale } from '../i18n/locales.js';
import { SHARED_MESSAGES } from '../i18n/shared-messages.js';
import type { Currency, StopSummary } from './network.js';
import type { BookingStatus } from './bookings.js';

/**
 * Payments (ADR-018, ADR-027). Passengers pay the platform. A provider adapter confirms each
 * method automatically, or (`manual` provider) the payer reports the transfer and platform staff
 * verify it. Fares are priced in USD or VES and converted with the rate the operator sets.
 */

export const PAYMENT_METHODS = ['pago_movil', 'bank_transfer', 'pix', 'usdt'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> =
  SHARED_MESSAGES.es.paymentMethod;

/** Currencies money is received in. USDT is valued 1:1 against the US dollar. */
export const PAYMENT_CURRENCIES = ['VES', 'BRL', 'USDT'] as const;
export type PaymentCurrency = (typeof PAYMENT_CURRENCIES)[number];

/**
 * The platform's rates (trip packs) older than this are not used: the method that needs one is
 * not offered until an admin saves the rates again, so packs are never sold at a stale rate.
 */
export const PLATFORM_RATE_MAX_HOURS = 24;

export const PAYMENT_METHOD_CURRENCY: Record<PaymentMethod, PaymentCurrency> = {
  pago_movil: 'VES',
  bank_transfer: 'VES',
  pix: 'BRL',
  usdt: 'USDT',
};

/**
 * `pending` → waiting for the money. `reported` → (manual) the payer says they paid and gave the
 * operation number; staff verify it. `confirmed` → received in time, the booking is confirmed.
 * `rejected` → (manual) staff did not find the money; the payer may try again. `cancelled` →
 * replaced by another method, or the booking ended unpaid. `refund_due` → money arrived but the
 * booking could no longer be confirmed (or the amount was wrong): it goes back. `refunded` →
 * platform staff sent a `refund_due` payment back to the payer.
 */
export const PAYMENT_STATUSES = [
  'pending',
  'reported',
  'confirmed',
  'rejected',
  'cancelled',
  'refund_due',
  'refunded',
] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> =
  SHARED_MESSAGES.es.paymentStatus;

// --- Exchange rates ----------------------------------------------------------------------------

/** Currencies a payment can be converted to, in units per US dollar. */
export const RATE_CURRENCIES = ['VES', 'BRL'] as const;
export type RateCurrency = (typeof RATE_CURRENCIES)[number];

/**
 * Currencies operators and the platform still set by hand. Bolívares always use the BCV's
 * official rate, fetched automatically (ADR-048).
 */
export const MANUAL_RATE_CURRENCIES = ['BRL'] as const satisfies readonly RateCurrency[];
export type ManualRateCurrency = (typeof MANUAL_RATE_CURRENCIES)[number];

/**
 * The BCV rate is published once per business day; with weekends and holidays the newest one can
 * be a few days old. Older than this, bolívar payments are not offered until it is updated.
 */
export const BCV_RATE_MAX_AGE_DAYS = 5;

export interface ExchangeRate {
  currency: RateCurrency;
  /** Decimal with up to four places, e.g. `"36.5000"` bolívares per dollar. */
  unitsPerUsd: string;
  updatedAt: string;
}

/**
 * `PUT /organizations/:id/exchange-rates` replaces every rate set by hand (only
 * `MANUAL_RATE_CURRENCIES`); omitted currencies are removed.
 */
export interface ReplaceExchangeRatesRequest {
  rates: { currency: ManualRateCurrency; unitsPerUsd: string }[];
}

// --- Payments ----------------------------------------------------------------------------------

/** One way to pay a held booking, with the amount already converted. */
export interface PaymentOption {
  method: PaymentMethod;
  amount: string;
  currency: PaymentCurrency;
  /** Units of `currency` per unit of the fare currency, when a conversion was needed. */
  rate: string | null;
}

/** `POST /me/bookings/:bookingId/payments` */
export interface CreatePaymentRequest {
  method: PaymentMethod;
}

export interface Payment {
  id: string;
  /** What is being paid: a booking, or a trip pack (exactly one is set). */
  bookingId: string | null;
  tripPackId: string | null;
  method: PaymentMethod;
  status: PaymentStatus;
  amount: string;
  currency: PaymentCurrency;
  rate: string | null;
  /** The payer writes it in the transfer concept / memo so the payment can be matched. */
  reference: string;
  /** Where to send the money, as label/value pairs to display in order. */
  instructions: { label: string; value: string }[];
  /** True when the simulated provider is active: the app may offer to simulate the payment. */
  simulated: boolean;
  /** True when people verify it: after paying, the payer reports the operation number. */
  manual: boolean;
  /** (manual) The operation number the payer reported, and when. */
  payerReference: string | null;
  reportedAt: string | null;
  /** (manual) Why staff rejected it. */
  rejectionReason: string | null;
  expiresAt: string | null;
  confirmedAt: string | null;
  /** For `refund_due` / `refunded`: what goes (or went) back to the payer. */
  refundAmount: string | null;
  createdAt: string;
}

/** `POST /me/payments/:paymentId/report` — "I paid": the bank operation number or transaction hash. */
export interface ReportPaymentRequest {
  operationNumber: string;
}

/**
 * While a reported payment waits for verification, the seats stay held this long (never past the
 * departure). A rejection gives the payer a fresh hold of `BOOKING_HOLD_MINUTES` to try again.
 */
export const PAYMENT_REVIEW_HOLD_HOURS = 6;

// --- Receiving accounts (manual provider) -------------------------------------------------------

/** What each method's account needs, in display order; the labels are shown to payers as-is. */
export const PAYMENT_ACCOUNT_FIELDS: Record<PaymentMethod, { key: string; label: string }[]> = {
  pago_movil: [
    { key: 'bank', label: 'Banco' },
    { key: 'phone', label: 'Teléfono' },
    { key: 'document', label: 'RIF o cédula' },
  ],
  bank_transfer: [
    { key: 'bank', label: 'Banco' },
    { key: 'account', label: 'Cuenta' },
    { key: 'holder', label: 'Titular' },
    { key: 'document', label: 'RIF o cédula' },
  ],
  pix: [
    { key: 'key', label: 'Chave PIX' },
    { key: 'holder', label: 'Favorecido' },
  ],
  usdt: [
    { key: 'network', label: 'Red' },
    { key: 'address', label: 'Dirección' },
  ],
};

/** An account the platform receives one method's money in. */
export interface PaymentAccount {
  method: PaymentMethod;
  fields: Record<string, string>;
  /** Inactive accounts are kept but the method is not offered. */
  active: boolean;
  updatedAt: string;
}

/** `PUT /admin/payment-accounts/:method` */
export interface PaymentAccountInput {
  fields: Record<string, string>;
  active: boolean;
}

/** Why an account's fields are invalid, or null: every field of the method, 1–120 characters. */
export function paymentAccountProblem(
  method: PaymentMethod,
  fields: Record<string, string>,
): string | null {
  const keys = PAYMENT_ACCOUNT_FIELDS[method].map((f) => f.key);
  const extra = Object.keys(fields).filter((k) => !keys.includes(k));
  if (extra.length) return `Unknown fields: ${extra.join(', ')}`;
  for (const key of keys) {
    const value = fields[key]?.trim() ?? '';
    if (!value || value.length > 120) return `${key} is required (up to 120 characters)`;
  }
  return null;
}

// --- Verification (manual provider) -------------------------------------------------------------

/** `GET /admin/payments/review` — a reported payment waiting for staff. */
export interface PaymentReview {
  payment: Payment;
  /** Null for a trip pack payment (`tripPack`). */
  booking: {
    id: string;
    code: string;
    status: BookingStatus;
    route: string;
    departsAt: string;
    /** Until when the seats stay held. */
    expiresAt: string | null;
  } | null;
  /** A trip pack the platform sells; null for a booking. */
  tripPack: { id: string; code: string; description: string; status: TripPackStatus } | null;
  /** Null for trip packs: the platform sells them. */
  operator: { id: string; name: string } | null;
  payer: { name: string; email: string | null; phone: string | null };
}

/** `POST /admin/payments/:paymentId/confirm` — what actually arrived (default: the amount due). */
export interface ConfirmPaymentRequest {
  receivedAmount?: string;
}

/** `POST /admin/payments/:paymentId/reject` */
export interface RejectPaymentRequest {
  reason: string;
}

// --- Tickets -----------------------------------------------------------------------------------

/** Prefix of the QR payload of a ticket: `VTP1.<ticket id>`. */
export const TICKET_QR_PREFIX = 'VTP1.';

/**
 * `POST /organizations/:id/tickets/validate` — the scanned QR payload, or the booking code and
 * seat typed by hand when the passenger's screen cannot be read.
 */
export type ValidateTicketRequest =
  | { qr: string }
  | { bookingCode: string; seatNumber: string }
  /** The 4-digit PIN the passenger says aloud, on the driver's trip (ADR-052). */
  | { tripId: string; pin: string };

/** A ticket PIN: 4 digits, unique among the active tickets of one departure (ADR-052). */
export const TICKET_PIN_PATTERN = /^\d{4}$/;

/** The PIN as typed (spaces or dashes removed), or null if it is not 4 digits. */
export function normalizePin(typed: string): string | null {
  const pin = typed.replace(/[\s-]/g, '');
  return TICKET_PIN_PATTERN.test(pin) ? pin : null;
}

/**
 * `boarded` → valid, marked as boarded now. `already_boarded` → used before (see `boardedAt`).
 * `not_paid` → the booking is not confirmed (held, cancelled, expired). `other_departure` → the
 * passenger boards more than 12 hours away from now. Only `boarded` lets the passenger on.
 */
export const TICKET_RESULTS = [
  'boarded',
  'already_boarded',
  'not_paid',
  'other_departure',
] as const;
export type TicketResult = (typeof TICKET_RESULTS)[number];

export interface TicketValidation {
  result: TicketResult;
  /** When the passenger boarded; null when they have not. */
  boardedAt: string | null;
  bookingCode: string;
  bookingStatus: BookingStatus;
  seatNumber: string;
  passengerName: string;
  documentNumber: string;
  route: { id: string; name: string };
  serviceDate: string;
  departsAt: string;
  from: StopSummary;
  to: StopSummary;
}

// --- Boarding without signal (ADR-049) -------------------------------------------------------

/** A ticket is accepted from 12 hours before to 12 hours after the passenger's boarding time. */
export const BOARDING_WINDOW_MS = 12 * 3600_000;
/** An open ticket (frequency service) is accepted from 1 hour before the first unit to the last. */
export const OPEN_TICKET_EARLY_MS = 3600_000;

/**
 * Whether `now` falls in the ticket's boarding window: the same rule in the API and in the
 * driver's phone when it checks tickets without signal. Times in milliseconds.
 */
export function inBoardingWindow(
  ticket: { departsAt: number; arrivesAt: number },
  open: boolean,
  now: number,
): boolean {
  if (open) return now >= ticket.departsAt - OPEN_TICKET_EARLY_MS && now <= ticket.arrivesAt;
  return Math.abs(now - ticket.departsAt) <= BOARDING_WINDOW_MS;
}

const TICKET_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The ticket id in a QR payload (`VTP1.<id>`), or null when it is not a ticket of ours. */
export function ticketIdFromQr(payload: string): string | null {
  const value = payload.trim();
  const id = value.startsWith(TICKET_QR_PREFIX) ? value.slice(TICKET_QR_PREFIX.length) : '';
  return TICKET_ID.test(id) ? id.toLowerCase() : null;
}

/** `vtp-7k3qxa`, `VTP7K3QXA` or `7K3QXA` → `VTP-7K3QXA`; null if it cannot be a booking code. */
export function normalizeBookingCode(input: string): string | null {
  const bare = input
    .trim()
    .toUpperCase()
    .replace(/^VTP-?/, '');
  return /^[A-Z0-9]{6}$/.test(bare) ? `VTP-${bare}` : null;
}

/** How long ahead the driver's phone keeps tickets for checking them without signal. */
export const OFFLINE_TICKETS_AHEAD_HOURS = 24;

/**
 * One ticket as the driver's phone keeps it to check without signal
 * (`GET /organizations/:id/tickets/offline`). Only what the check needs: the ID number is masked.
 */
export interface OfflineTicket {
  /** The id in the QR. */
  ticketId: string;
  /** The departure, to check a PIN on the driver's trip (ADR-052). */
  tripId: string;
  /** 4 digits; null on tickets issued before PINs existed. */
  pin: string | null;
  bookingCode: string;
  seatNumber: string;
  passengerName: string;
  /** Only the last digits, e.g. `V-•••5678`. */
  documentHint: string;
  route: { id: string; name: string };
  serviceDate: string;
  /** Network ISO times of the passenger's boarding window. */
  departsAt: string;
  arrivesAt: string;
  /** An open ticket of a frequency service (ADR-032). */
  open: boolean;
  from: StopSummary;
  to: StopSummary;
  /** Already boarded when the list was made. */
  boardedAt: string | null;
}

export interface OfflineTicketList {
  generatedAt: string;
  tickets: OfflineTicket[];
}

/** A ticket the phone let board without signal, sent when the signal is back. */
export interface OfflineBoarding {
  ticketId: string;
  /** When it was scanned (ISO). */
  boardedAt: string;
}

/** `POST /organizations/:id/tickets/offline-boardings` */
export interface OfflineBoardingsRequest {
  boardings: OfflineBoarding[];
}

export const OFFLINE_BOARDING_RESULTS = [
  'boarded',
  'already_boarded',
  'not_paid',
  'not_found',
] as const;
export type OfflineBoardingResult = (typeof OFFLINE_BOARDING_RESULTS)[number];

export interface OfflineBoardingOutcome {
  ticketId: string;
  result: OfflineBoardingResult;
}

/**
 * Found when the boardings checked without signal reach the API: a ticket another unit or driver
 * had already used (`double_use`), or one whose booking was cancelled meanwhile (`not_paid`).
 * The line reviews them in its portal.
 */
export const BOARDING_ISSUE_KINDS = ['double_use', 'not_paid'] as const;
export type BoardingIssueKind = (typeof BOARDING_ISSUE_KINDS)[number];

export const BOARDING_ISSUE_LABELS: Record<BoardingIssueKind, string> = {
  double_use: 'Usado dos veces',
  not_paid: 'Reserva cancelada',
};

/** `GET /organizations/:id/tickets/boarding-issues?date=` */
export interface BoardingIssue {
  id: string;
  kind: BoardingIssueKind;
  bookingCode: string;
  seatNumber: string;
  passengerName: string;
  route: { id: string; name: string };
  serviceDate: string;
  /** The first, accepted boarding (null for `not_paid`). */
  first: { boardedAt: string; driverName: string | null } | null;
  /** The boarding reported without signal. */
  second: { boardedAt: string; driverName: string | null };
  createdAt: string;
}

/** "US$ 35,00", "Bs. 1.277,50", "R$ 175,00", "35,00 USDT" */
export function formatPaymentAmount(
  amount: string,
  currency: PaymentCurrency | Currency,
  locale: Locale = DEFAULT_LOCALE,
): string {
  const value = new Intl.NumberFormat(INTL_LOCALES[locale], {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(amount));
  switch (currency) {
    case 'USD':
      return `US$ ${value}`;
    case 'VES':
      return `Bs. ${value}`;
    case 'BRL':
      return `R$ ${value}`;
    case 'USDT':
      return `${value} USDT`;
  }
}
