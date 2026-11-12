import type { Currency } from './network.js';

/**
 * Fiscal module (ADR-031): the platform invoices only its service fee (VAT included); fares are
 * invoiced by each transport company. Invoices start as drafts that platform staff issue in the
 * SENIAT portal (or, later, through an authorized digital printer) and then record the invoice
 * and control numbers. Amounts on documents are in bolívares at the BCV rate of the day.
 */

/** `ordinary`: charges VAT. `formal`: does not charge VAT (sales are recorded as not taxed). */
export const TAXPAYER_TYPES = ['ordinary', 'formal'] as const;
export type TaxpayerType = (typeof TAXPAYER_TYPES)[number];

export const TAXPAYER_TYPE_LABELS: Record<TaxpayerType, string> = {
  ordinary: 'Contribuyente ordinario de IVA',
  formal: 'Contribuyente formal de IVA',
};

/** `draft`: staff issue each invoice by hand. `digital_printer`: an authorized provider's API. */
export const INVOICE_ISSUERS = ['draft', 'digital_printer'] as const;
export type InvoiceIssuerKind = (typeof INVOICE_ISSUERS)[number];

/** Buyer ID types on Venezuelan invoices. */
export const BUYER_ID_TYPES = ['V', 'E', 'J', 'G', 'P'] as const;
export type BuyerIdType = (typeof BUYER_ID_TYPES)[number];

/** `GET/PUT /admin/fiscal/settings`: who invoices and how. */
export interface FiscalSettings {
  /** The registered name (e.g. the firma personal). */
  legalName: string;
  /** e.g. V-12345678-9 or J-12345678-9. */
  rif: string;
  fiscalAddress: string;
  taxpayerType: TaxpayerType;
  /** VAT percentage included in the service fee, e.g. "16.00" (ignored for formal taxpayers). */
  vatRate: string;
  /** Read from the server configuration (`INVOICE_ISSUER`). */
  issuer: InvoiceIssuerKind;
  /** False until legalName, rif and fiscalAddress are filled in. */
  complete: boolean;
}

export type FiscalSettingsInput = Omit<FiscalSettings, 'issuer' | 'complete'>;

/** BCV official rate for one day (`/admin/fiscal/bcv-rates`). */
export interface BcvRate {
  date: string;
  /** Bolívares per US dollar. */
  unitsPerUsd: string;
}

export const INVOICE_KINDS = ['invoice', 'credit_note'] as const;
export type InvoiceKind = (typeof INVOICE_KINDS)[number];

export const INVOICE_STATUSES = ['draft', 'issued', 'voided'] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

export const INVOICE_STATUS_LABELS: Record<InvoiceStatus, string> = {
  draft: 'Por emitir',
  issued: 'Emitida',
  voided: 'Anulada',
};

/**
 * Why a document exists: the fee a passenger paid (`service_fee`), its refund to the passenger
 * when the operator cancelled (`fee_refund`, a credit note), and the fee the operator then bears
 * (`operator_cancellation`, invoiced to the operator).
 */
export const INVOICE_REASONS = ['service_fee', 'fee_refund', 'operator_cancellation'] as const;
export type InvoiceReason = (typeof INVOICE_REASONS)[number];

export interface InvoiceBuyer {
  name: string;
  idType: BuyerIdType;
  idNumber: string;
  address: string | null;
}

/** Bolívar amounts of a document. */
export interface InvoiceAmounts {
  /** Taxable base (0 for formal taxpayers). */
  base: string;
  /** Sales not taxed (formal taxpayers). */
  notTaxed: string;
  vatRate: string;
  vat: string;
  total: string;
}

/**
 * A service-fee invoice or a credit note. Drafts carry the amounts in the fee's currency; the
 * bolívar amounts are fixed when it is issued, at the BCV rate of that day.
 */
export interface Invoice {
  id: string;
  kind: InvoiceKind;
  reason: InvoiceReason;
  status: InvoiceStatus;
  bookingId: string;
  bookingCode: string;
  /** The invoice a credit note corrects. */
  relatedInvoice: { id: string; number: string | null } | null;
  buyer: InvoiceBuyer;
  description: string;
  /** The service fee, VAT included, in its own currency. */
  amount: string;
  currency: Currency;
  /** Set when issued, with the numbers, date (YYYY-MM-DD), BCV rate and bolívar amounts. */
  taxpayerType: TaxpayerType | null;
  number: string | null;
  controlNumber: string | null;
  issuedOn: string | null;
  exchangeRate: string | null;
  amountsVes: InvoiceAmounts | null;
  voidReason: string | null;
  createdAt: string;
}

/**
 * `POST /admin/fiscal/invoices/:id/issue`. In draft mode staff send what the SENIAT portal
 * returned; with a digital printer the numbers come from the provider and are not sent.
 */
export interface IssueInvoiceRequest {
  number?: string;
  controlNumber?: string;
  /** Issue date (YYYY-MM-DD); the latest BCV rate on or before it converts the amount. Default: today. */
  issuedOn?: string;
}

/** `PATCH /admin/fiscal/invoices/:id/buyer`: the buyer asked for the invoice in another name. */
export type UpdateInvoiceBuyerRequest = InvoiceBuyer;

export interface VoidInvoiceRequest {
  reason: string;
}

/** `GET /admin/fiscal/invoices` filters. */
export interface InvoicesQuery {
  status?: InvoiceStatus;
  /** Venezuelan calendar month of creation, e.g. 2026-11. */
  month?: string;
}

/** A purchase invoice the platform received (for the purchases book), entered by staff. */
export interface Purchase {
  id: string;
  date: string;
  supplierRif: string;
  supplierName: string;
  invoiceNumber: string;
  controlNumber: string;
  /** Bolívar amounts. */
  base: string;
  exempt: string;
  vatRate: string;
  vat: string;
  total: string;
  createdAt: string;
}

export type PurchaseInput = Omit<Purchase, 'id' | 'total' | 'createdAt'>;

/** One line of the monthly sales book (Reglamento de la Ley del IVA). */
export interface SalesBookRow {
  date: string;
  documentType: 'FAC' | 'NC';
  number: string;
  controlNumber: string;
  affectedInvoice: string | null;
  buyerId: string;
  buyerName: string;
  /** Negative for credit notes. */
  total: string;
  notTaxed: string;
  base: string;
  vatRate: string;
  vat: string;
  vatWithheld: string;
}

export interface FiscalBook<Row> {
  month: string;
  rows: Row[];
  summary: { total: string; notTaxed: string; base: string; vat: string };
}

export type SalesBook = FiscalBook<SalesBookRow>;
export type PurchasesBook = FiscalBook<Purchase>;

const scaled = (value: string) => {
  const negative = value.trim().startsWith('-');
  const [whole = '0', fraction = ''] = value.trim().replace('-', '').split('.');
  const result = BigInt(whole || '0') * 100n + BigInt((fraction + '00').slice(0, 2));
  return negative ? -result : result;
};
const show = (value: bigint) => {
  const sign = value < 0n ? '-' : '';
  const abs = value < 0n ? -value : value;
  return `${sign}${abs / 100n}.${(abs % 100n).toString().padStart(2, '0')}`;
};

/** `amount` × `rate`, rounded half up to cents (amounts with 2 decimals, rate with up to 6). */
export function convertAmount(amount: string, rate: string): string {
  const [whole = '0', fraction = ''] = rate.split('.');
  const rateScaled = BigInt(whole) * 1_000_000n + BigInt((fraction + '000000').slice(0, 6));
  const product = scaled(amount) * rateScaled;
  const half = product >= 0n ? 500_000n : -500_000n;
  return show((product + half) / 1_000_000n);
}

/**
 * Splits a VAT-included bolívar total (ADR-031). Ordinary taxpayers: base = total / (1 + rate),
 * rounded half up, and VAT is the rest. Formal taxpayers charge no VAT: all of it is not taxed.
 */
export function splitVatIncluded(
  total: string,
  vatRate: string,
  taxpayerType: TaxpayerType,
): InvoiceAmounts {
  if (taxpayerType === 'formal') {
    return {
      base: '0.00',
      notTaxed: show(scaled(total)),
      vatRate: '0.00',
      vat: '0.00',
      total: show(scaled(total)),
    };
  }
  const t = scaled(total);
  const r = scaled(vatRate); // percent × 100
  const divisor = 10_000n + r;
  const numerator = t * 10_000n;
  const half = numerator >= 0n ? divisor / 2n : -divisor / 2n;
  const base = (numerator + half) / divisor;
  return {
    base: show(base),
    notTaxed: '0.00',
    vatRate: show(r),
    vat: show(t - base),
    total: show(t),
  };
}

/** Sum of 2-decimal amounts (negative ones included). */
export function addAmounts(...values: string[]): string {
  return show(values.reduce((sum, value) => sum + scaled(value), 0n));
}

/** The amount with its sign flipped ("0.00" stays "0.00"). */
export function negateAmount(value: string): string {
  return show(-scaled(value));
}
