import { DEFAULT_LOCALE, INTL_LOCALES, type Locale } from '../i18n/locales.js';
import { SHARED_MESSAGES } from '../i18n/shared-messages.js';
import type { Currency, StopSummary } from './network.js';
import type { BookingStatus } from './bookings.js';

/**
 * Payments (ADR-018). Passengers pay the platform; each method is confirmed automatically by a
 * provider adapter. Fares are priced in USD or VES and converted with the rate the operator sets.
 */

export const PAYMENT_METHODS = ['pago_movil', 'bank_transfer', 'pix', 'usdt'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> =
  SHARED_MESSAGES.es.paymentMethod;

/** Currencies money is received in. USDT is valued 1:1 against the US dollar. */
export const PAYMENT_CURRENCIES = ['VES', 'BRL', 'USDT'] as const;
export type PaymentCurrency = (typeof PAYMENT_CURRENCIES)[number];

export const PAYMENT_METHOD_CURRENCY: Record<PaymentMethod, PaymentCurrency> = {
  pago_movil: 'VES',
  bank_transfer: 'VES',
  pix: 'BRL',
  usdt: 'USDT',
};

/**
 * `pending` → waiting for the money. `confirmed` → received in time, the booking is confirmed.
 * `cancelled` → replaced by another method, or the booking ended unpaid. `refund_due` → money
 * arrived but the booking could no longer be confirmed (or the amount was wrong): it goes back.
 * `refunded` → platform staff sent a `refund_due` payment back to the payer.
 */
export const PAYMENT_STATUSES = [
  'pending',
  'confirmed',
  'cancelled',
  'refund_due',
  'refunded',
] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> =
  SHARED_MESSAGES.es.paymentStatus;

// --- Exchange rates ----------------------------------------------------------------------------

/** Currencies an operator sets a rate for, in units per US dollar. */
export const RATE_CURRENCIES = ['VES', 'BRL'] as const;
export type RateCurrency = (typeof RATE_CURRENCIES)[number];

export interface ExchangeRate {
  currency: RateCurrency;
  /** Decimal with up to four places, e.g. `"36.5000"` bolívares per dollar. */
  unitsPerUsd: string;
  updatedAt: string;
}

/** `PUT /organizations/:id/exchange-rates` replaces every rate; omitted currencies are removed. */
export interface ReplaceExchangeRatesRequest {
  rates: { currency: RateCurrency; unitsPerUsd: string }[];
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
  bookingId: string;
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
  expiresAt: string | null;
  confirmedAt: string | null;
  createdAt: string;
}

// --- Tickets -----------------------------------------------------------------------------------

/** Prefix of the QR payload of a ticket: `VTP1.<ticket id>`. */
export const TICKET_QR_PREFIX = 'VTP1.';

/**
 * `POST /organizations/:id/tickets/validate` — the scanned QR payload, or the booking code and
 * seat typed by hand when the passenger's screen cannot be read.
 */
export type ValidateTicketRequest = { qr: string } | { bookingCode: string; seatNumber: string };

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
