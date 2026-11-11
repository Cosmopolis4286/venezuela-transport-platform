import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import {
  addAmounts,
  convertAmount,
  negateAmount,
  splitVatIncluded,
  todayInVenezuela,
  type BcvRate,
  type FiscalSettings,
  type FiscalSettingsInput,
  type Invoice,
  type InvoicesQuery,
  type IssueInvoiceRequest,
  type Purchase,
  type PurchaseInput,
  type PurchasesBook,
  type SalesBook,
  type SalesBookRow,
  type UpdateInvoiceBuyerRequest,
} from '@vtp/shared-types';
import { and, asc, desc, eq, gte, lt, lte } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { ApiException } from '../../common/errors/api.exception.js';
import { DatabaseService } from '../../database/database.service.js';
import { AuditService } from '../audit/audit.service.js';
import { bookings } from '../bookings/bookings.schema.js';
import type { Authenticated, RequestMeta } from '../identity/sessions.service.js';
import { normalizeRif } from '../organizations/rif.js';
import { monthRange } from '../settlements/settlements.service.js';
import {
  bcvRates,
  fiscalSettings,
  invoices,
  purchases,
  type InvoiceRow,
  type PurchaseRow,
} from './fiscal.schema.js';
import { INVOICE_ISSUER, type InvoiceIssuer } from './invoice-issuer.js';

const DEFAULTS: FiscalSettingsInput = {
  legalName: '',
  rif: '',
  fiscalAddress: '',
  taxpayerType: 'ordinary',
  vatRate: '16.00',
};

const isUniqueViolation = (error: unknown) =>
  (error as { cause?: { code?: string } }).cause?.code === '23505' ||
  (error as { code?: string }).code === '23505';

const notFound = (what: string) =>
  new ApiException('NOT_FOUND', `${what} not found`, HttpStatus.NOT_FOUND);
const invalid = (message: string) =>
  new ApiException('VALIDATION_FAILED', message, HttpStatus.BAD_REQUEST);

/** `2026-11` → [`2026-11-01`, `2026-12-01`), for date columns. */
export function monthDates(month: string): [string, string] {
  const [year, m] = month.split('-').map(Number) as [number, number];
  const next = m === 12 ? `${year + 1}-01` : `${year}-${String(m + 1).padStart(2, '0')}`;
  return [`${month}-01`, `${next}-01`];
}

const normalizeRate = (rate: string) => Number(rate).toFixed(2);

/**
 * The platform's own invoicing (ADR-031): its fiscal details, BCV rates, the service-fee
 * documents written with each booking's money, and the monthly sales and purchases books.
 */
@Injectable()
export class FiscalService {
  constructor(
    private readonly database: DatabaseService,
    private readonly audit: AuditService,
    @Inject(INVOICE_ISSUER) private readonly issuer: InvoiceIssuer,
  ) {}

  async settings(): Promise<FiscalSettings> {
    const [row] = await this.database.db.select().from(fiscalSettings);
    const input: FiscalSettingsInput = row
      ? {
          legalName: row.legalName,
          rif: row.rif,
          fiscalAddress: row.fiscalAddress,
          taxpayerType: row.taxpayerType,
          vatRate: row.vatRate,
        }
      : DEFAULTS;
    return {
      ...input,
      issuer: this.issuer.kind,
      complete: Boolean(input.legalName && input.rif && input.fiscalAddress),
    };
  }

  async setSettings(
    input: FiscalSettingsInput,
    actor: Authenticated,
    meta: RequestMeta,
  ): Promise<FiscalSettings> {
    const rif = input.rif.trim() ? normalizeRif(input.rif) : '';
    if (rif === null) throw invalid('rif must look like V-12345678-9 or J-12345678-9');
    const values = {
      legalName: input.legalName.trim(),
      rif,
      fiscalAddress: input.fiscalAddress.trim(),
      taxpayerType: input.taxpayerType,
      vatRate: normalizeRate(input.vatRate),
      updatedByUserId: actor.user.id,
    };
    await this.database.db
      .insert(fiscalSettings)
      .values({ id: 1, ...values })
      .onConflictDoUpdate({ target: fiscalSettings.id, set: { ...values, updatedAt: new Date() } });
    await this.record('fiscal.settings_updated', 'fiscal_settings', '1', actor, meta, {
      taxpayerType: values.taxpayerType,
      vatRate: values.vatRate,
    });
    return this.settings();
  }

  async bcvRates(): Promise<BcvRate[]> {
    const rows = await this.database.db
      .select({ date: bcvRates.date, unitsPerUsd: bcvRates.unitsPerUsd })
      .from(bcvRates)
      .orderBy(desc(bcvRates.date))
      .limit(60);
    return rows;
  }

  async setBcvRate(input: BcvRate, actor: Authenticated, meta: RequestMeta): Promise<BcvRate> {
    if (input.date > todayInVenezuela()) throw invalid('The rate date cannot be in the future');
    if (Number(input.unitsPerUsd) <= 0) throw invalid('unitsPerUsd must be positive');
    const values = { unitsPerUsd: input.unitsPerUsd, updatedByUserId: actor.user.id };
    await this.database.db
      .insert(bcvRates)
      .values({ date: input.date, ...values })
      .onConflictDoUpdate({ target: bcvRates.date, set: { ...values, updatedAt: new Date() } });
    await this.record('fiscal.bcv_rate_set', 'bcv_rate', input.date, actor, meta, {
      unitsPerUsd: input.unitsPerUsd,
    });
    const [row] = await this.database.db
      .select({ date: bcvRates.date, unitsPerUsd: bcvRates.unitsPerUsd })
      .from(bcvRates)
      .where(eq(bcvRates.date, input.date));
    return row!;
  }

  async invoices(query: InvoicesQuery = {}): Promise<Invoice[]> {
    const range = query.month ? monthRange(query.month) : null;
    const rows = await this.select(
      and(
        query.status ? eq(invoices.status, query.status) : undefined,
        range ? gte(invoices.createdAt, range[0]) : undefined,
        range ? lt(invoices.createdAt, range[1]) : undefined,
      ),
    );
    return rows;
  }

  async invoice(invoiceId: string): Promise<Invoice> {
    const [invoice] = await this.select(eq(invoices.id, invoiceId));
    if (!invoice) throw notFound('Invoice');
    return invoice;
  }

  /** Drafts only: the buyer asked for the invoice in another name or with an address. */
  async updateBuyer(
    invoiceId: string,
    buyer: UpdateInvoiceBuyerRequest,
    actor: Authenticated,
    meta: RequestMeta,
  ): Promise<Invoice> {
    const [row] = await this.database.db
      .update(invoices)
      .set({
        buyerName: buyer.name.trim(),
        buyerIdType: buyer.idType,
        buyerIdNumber: buyer.idNumber.trim().toUpperCase(),
        buyerAddress: buyer.address?.trim() || null,
        updatedAt: new Date(),
      })
      .where(and(eq(invoices.id, invoiceId), eq(invoices.status, 'draft')))
      .returning({ id: invoices.id });
    if (!row) {
      await this.invoice(invoiceId);
      throw ApiException.conflict('Only drafts can change their buyer', 'INVOICE_NOT_DRAFT');
    }
    await this.record('fiscal.invoice_buyer_updated', 'invoice', invoiceId, actor, meta, {});
    return this.invoice(invoiceId);
  }

  /**
   * Fixes a draft's numbers, date and bolívar amounts. The amount in dollars is converted at the
   * latest BCV rate on or before the issue date; VAT is taken out of the total (it is included).
   */
  async issue(
    invoiceId: string,
    request: IssueInvoiceRequest,
    actor: Authenticated,
    meta: RequestMeta,
  ): Promise<Invoice> {
    this.issuer.validate(request);
    const settings = await this.settings();
    if (!settings.complete) {
      throw ApiException.conflict(
        'Fill in the fiscal settings first',
        'FISCAL_SETTINGS_INCOMPLETE',
      );
    }
    const issuedOn = request.issuedOn ?? todayInVenezuela();
    if (issuedOn > todayInVenezuela()) throw invalid('The issue date cannot be in the future');
    const [current] = await this.database.db
      .select()
      .from(invoices)
      .where(eq(invoices.id, invoiceId));
    if (!current) throw notFound('Invoice');
    if (current.status !== 'draft') {
      throw ApiException.conflict('This document is not a draft', 'INVOICE_NOT_DRAFT');
    }
    if (current.relatedInvoiceId) {
      const [related] = await this.database.db
        .select({ status: invoices.status })
        .from(invoices)
        .where(eq(invoices.id, current.relatedInvoiceId));
      if (related?.status !== 'issued') {
        throw ApiException.conflict(
          'Issue the invoice this credit note corrects first',
          'INVOICE_RELATED_NOT_ISSUED',
        );
      }
    }
    const exchangeRate = current.currency === 'VES' ? '1.000000' : await this.rateOn(issuedOn);
    const amounts = splitVatIncluded(
      convertAmount(current.amount, exchangeRate),
      settings.vatRate,
      settings.taxpayerType,
    );
    const numbers = await this.issuer.issue(current, settings, request);
    let updated: { id: string } | undefined;
    try {
      [updated] = await this.database.db
        .update(invoices)
        .set({
          status: 'issued',
          number: numbers.number,
          controlNumber: numbers.controlNumber,
          issuerReference: numbers.reference,
          issuedOn,
          taxpayerType: settings.taxpayerType,
          exchangeRate,
          vatRate: amounts.vatRate,
          baseVes: amounts.base,
          notTaxedVes: amounts.notTaxed,
          vatVes: amounts.vat,
          totalVes: amounts.total,
          issuedByUserId: actor.user.id,
          updatedAt: new Date(),
        })
        .where(and(eq(invoices.id, invoiceId), eq(invoices.status, 'draft')))
        .returning({ id: invoices.id });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw ApiException.conflict(
          'Another document has this number or control number',
          'INVOICE_NUMBER_TAKEN',
        );
      }
      throw error;
    }
    if (!updated) throw ApiException.conflict('This document is not a draft', 'INVOICE_NOT_DRAFT');
    await this.record('fiscal.invoice_issued', 'invoice', invoiceId, actor, meta, {
      kind: current.kind,
      number: numbers.number,
      controlNumber: numbers.controlNumber,
    });
    return this.invoice(invoiceId);
  }

  /**
   * Voids a draft that will not be issued, or an issued document that was voided in the SENIAT
   * portal (it stays in the sales book with zero amounts).
   */
  async void(
    invoiceId: string,
    reason: string,
    actor: Authenticated,
    meta: RequestMeta,
  ): Promise<Invoice> {
    const current = await this.invoice(invoiceId);
    if (current.status === 'voided') {
      throw ApiException.conflict('Already voided', 'INVOICE_ALREADY_VOIDED');
    }
    await this.database.db
      .update(invoices)
      .set({
        status: 'voided',
        voidReason: reason.trim(),
        voidedAt: new Date(),
        voidedByUserId: actor.user.id,
        updatedAt: new Date(),
      })
      .where(and(eq(invoices.id, invoiceId), eq(invoices.status, current.status)));
    await this.record('fiscal.invoice_voided', 'invoice', invoiceId, actor, meta, {
      wasIssued: current.status === 'issued',
    });
    return this.invoice(invoiceId);
  }

  /** The sales book of one month: every numbered document, by issue date and number. */
  async salesBook(month: string): Promise<SalesBook> {
    const [from, to] = monthDates(month);
    const related = alias(invoices, 'related');
    const rows = await this.database.db
      .select()
      .from(invoices)
      .leftJoin(related, eq(related.id, invoices.relatedInvoiceId))
      .where(and(gte(invoices.issuedOn, from), lt(invoices.issuedOn, to)))
      .orderBy(asc(invoices.issuedOn), asc(invoices.kind), asc(invoices.number));
    const bookRows: SalesBookRow[] = rows.map(({ invoices: invoice, related: affectedRow }) => {
      const affected = affectedRow?.number ?? null;
      const voided = invoice.status === 'voided';
      const sign = (value: string | null) => {
        if (voided || value === null) return '0.00';
        return invoice.kind === 'credit_note' ? negateAmount(value) : value;
      };
      return {
        date: invoice.issuedOn!,
        documentType: invoice.kind === 'credit_note' ? 'NC' : 'FAC',
        number: invoice.number!,
        controlNumber: invoice.controlNumber!,
        affectedInvoice: affected,
        buyerId: `${invoice.buyerIdType}-${invoice.buyerIdNumber}`,
        buyerName: voided ? 'ANULADA' : invoice.buyerName,
        total: sign(invoice.totalVes),
        notTaxed: sign(invoice.notTaxedVes),
        base: sign(invoice.baseVes),
        vatRate: voided ? '0.00' : (invoice.vatRate ?? '0.00'),
        vat: sign(invoice.vatVes),
        vatWithheld: '0.00',
      };
    });
    return {
      month,
      rows: bookRows,
      summary: {
        total: addAmounts(...bookRows.map((r) => r.total)),
        notTaxed: addAmounts(...bookRows.map((r) => r.notTaxed)),
        base: addAmounts(...bookRows.map((r) => r.base)),
        vat: addAmounts(...bookRows.map((r) => r.vat)),
      },
    };
  }

  async purchasesBook(month: string): Promise<PurchasesBook> {
    const [from, to] = monthDates(month);
    const rows = (
      await this.database.db
        .select()
        .from(purchases)
        .where(and(gte(purchases.date, from), lt(purchases.date, to)))
        .orderBy(asc(purchases.date), asc(purchases.createdAt))
    ).map(toPurchase);
    return {
      month,
      rows,
      summary: {
        total: addAmounts(...rows.map((r) => r.total)),
        notTaxed: addAmounts(...rows.map((r) => r.exempt)),
        base: addAmounts(...rows.map((r) => r.base)),
        vat: addAmounts(...rows.map((r) => r.vat)),
      },
    };
  }

  async createPurchase(
    input: PurchaseInput,
    actor: Authenticated,
    meta: RequestMeta,
  ): Promise<Purchase> {
    if (input.date > todayInVenezuela()) throw invalid('The invoice date cannot be in the future');
    const supplierRif = normalizeRif(input.supplierRif);
    if (!supplierRif) throw invalid('supplierRif must look like J-12345678-9');
    let row: PurchaseRow | undefined;
    try {
      [row] = await this.database.db
        .insert(purchases)
        .values({
          date: input.date,
          supplierRif,
          supplierName: input.supplierName.trim(),
          invoiceNumber: input.invoiceNumber.trim(),
          controlNumber: input.controlNumber.trim(),
          base: input.base,
          exempt: input.exempt,
          vatRate: normalizeRate(input.vatRate),
          vat: input.vat,
          total: addAmounts(input.base, input.exempt, input.vat),
          createdByUserId: actor.user.id,
        })
        .returning();
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw ApiException.conflict('Purchase already recorded', 'PURCHASE_TAKEN');
      }
      throw error;
    }
    await this.record('fiscal.purchase_created', 'purchase', row!.id, actor, meta, {
      supplierRif,
      invoiceNumber: row!.invoiceNumber,
    });
    return toPurchase(row!);
  }

  /** Purchases are typed by hand: a mistake is deleted and typed again. */
  async deletePurchase(purchaseId: string, actor: Authenticated, meta: RequestMeta) {
    const [row] = await this.database.db
      .delete(purchases)
      .where(eq(purchases.id, purchaseId))
      .returning();
    if (!row) throw notFound('Purchase');
    await this.record('fiscal.purchase_deleted', 'purchase', purchaseId, actor, meta, {
      supplierRif: row.supplierRif,
      invoiceNumber: row.invoiceNumber,
    });
  }

  private async rateOn(day: string): Promise<string> {
    const [rate] = await this.database.db
      .select({ unitsPerUsd: bcvRates.unitsPerUsd })
      .from(bcvRates)
      .where(lte(bcvRates.date, day))
      .orderBy(desc(bcvRates.date))
      .limit(1);
    if (!rate) throw ApiException.conflict('No BCV rate on or before that day', 'BCV_RATE_MISSING');
    return rate.unitsPerUsd;
  }

  private async select(where: ReturnType<typeof and>): Promise<Invoice[]> {
    const related = alias(invoices, 'related');
    const rows = await this.database.db
      .select({ invoice: invoices, code: bookings.code, relatedNumber: related.number })
      .from(invoices)
      .innerJoin(bookings, eq(bookings.id, invoices.bookingId))
      .leftJoin(related, eq(related.id, invoices.relatedInvoiceId))
      .where(where)
      .orderBy(desc(invoices.createdAt))
      .limit(500);
    return rows.map(({ invoice, code, relatedNumber }) => toInvoice(invoice, code, relatedNumber));
  }

  private record(
    action: string,
    targetType: string,
    targetId: string,
    actor: Authenticated,
    meta: RequestMeta,
    metadata: Record<string, unknown>,
  ) {
    return this.audit.record({
      action,
      actorUserId: actor.user.id,
      targetType,
      targetId,
      ip: meta.ip,
      metadata,
    });
  }
}

function toInvoice(row: InvoiceRow, bookingCode: string, relatedNumber: string | null): Invoice {
  const issued = row.totalVes !== null;
  return {
    id: row.id,
    kind: row.kind,
    reason: row.reason,
    status: row.status,
    bookingId: row.bookingId,
    bookingCode,
    relatedInvoice: row.relatedInvoiceId
      ? { id: row.relatedInvoiceId, number: relatedNumber }
      : null,
    buyer: {
      name: row.buyerName,
      idType: row.buyerIdType,
      idNumber: row.buyerIdNumber,
      address: row.buyerAddress,
    },
    description: row.description,
    amount: row.amount,
    currency: row.currency,
    taxpayerType: row.taxpayerType,
    number: row.number,
    controlNumber: row.controlNumber,
    issuedOn: row.issuedOn,
    exchangeRate: row.exchangeRate,
    amountsVes: issued
      ? {
          base: row.baseVes!,
          notTaxed: row.notTaxedVes!,
          vatRate: row.vatRate!,
          vat: row.vatVes!,
          total: row.totalVes!,
        }
      : null,
    voidReason: row.voidReason,
    createdAt: row.createdAt.toISOString(),
  };
}

function toPurchase(row: PurchaseRow): Purchase {
  return {
    id: row.id,
    date: row.date,
    supplierRif: row.supplierRif,
    supplierName: row.supplierName,
    invoiceNumber: row.invoiceNumber,
    controlNumber: row.controlNumber,
    base: row.base,
    exempt: row.exempt,
    vatRate: row.vatRate,
    vat: row.vat,
    total: row.total,
    createdAt: row.createdAt.toISOString(),
  };
}
