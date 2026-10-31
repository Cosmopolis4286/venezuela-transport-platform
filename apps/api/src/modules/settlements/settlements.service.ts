import { HttpStatus, Injectable } from '@nestjs/common';
import {
  CURRENCIES,
  NETWORK_UTC_OFFSET,
  todayInVenezuela,
  type AdminSettlementSummary,
  type CreatePayoutRequest,
  type Currency,
  type OrganizationSettlement,
  type Payout,
  type RefundDuePayment,
  type SettlementBalance,
  type SettlementEntry,
} from '@vtp/shared-types';
import { and, desc, eq, gte, inArray, isNull, lt, sql, type AnyColumn } from 'drizzle-orm';
import { ApiException } from '../../common/errors/api.exception.js';
import { AppConfigService } from '../../config/app-config.service.js';
import { DatabaseService } from '../../database/database.service.js';
import { AuditService } from '../audit/audit.service.js';
import { bookings, trips } from '../bookings/bookings.schema.js';
import { users } from '../identity/identity.schema.js';
import type { Authenticated, RequestMeta } from '../identity/sessions.service.js';
import { routes } from '../network/network.schema.js';
import { organizations } from '../organizations/organizations.schema.js';
import { fromScaled, toScaled } from '../payments/money.js';
import { payments } from '../payments/payments.schema.js';
import { normalizeRate } from './ledger.js';
import {
  organizationCommissions,
  payouts,
  settlementEntries,
  type PayoutRow,
} from './settlements.schema.js';

const notFound = (message: string) => new ApiException('NOT_FOUND', message, HttpStatus.NOT_FOUND);
const invalid = (message: string) =>
  new ApiException('VALIDATION_FAILED', message, HttpStatus.BAD_REQUEST);

/** Sum of a numeric column as a two-decimal string ("0.00" when there are no rows). */
const total = (column: AnyColumn) =>
  sql<string>`coalesce(sum(${column}), 0)::numeric(14, 2)::text`;

interface Totals {
  organizationId: string;
  currency: Currency;
  gross?: string;
  commission?: string;
  earned?: string;
  paidOut?: string;
}

@Injectable()
export class SettlementsService {
  constructor(
    private readonly database: DatabaseService,
    private readonly audit: AuditService,
    private readonly config: AppConfigService,
  ) {}

  private get defaultRate(): string {
    return normalizeRate(this.config.get('PLATFORM_COMMISSION_PERCENT'));
  }

  // --- Operators ------------------------------------------------------------------------------

  async settlement(organizationId: string): Promise<OrganizationSettlement> {
    const [summary] = await this.summaries([organizationId]);
    return (
      summary ?? {
        organizationId,
        commissionRate: this.defaultRate,
        commissionOverride: null,
        balances: [],
      }
    );
  }

  /** Paid bookings of one Venezuelan calendar month (`YYYY-MM`, the current one by default). */
  async entries(organizationId: string, month?: string): Promise<SettlementEntry[]> {
    const [from, to] = monthRange(month ?? todayInVenezuela().slice(0, 7));
    const rows = await this.database.db
      .select({
        entry: settlementEntries,
        bookingCode: bookings.code,
        route: { id: routes.id, name: routes.name },
        serviceDate: trips.serviceDate,
      })
      .from(settlementEntries)
      .innerJoin(bookings, eq(bookings.id, settlementEntries.bookingId))
      .innerJoin(trips, eq(trips.id, bookings.tripId))
      .innerJoin(routes, eq(routes.id, trips.routeId))
      .where(
        and(
          eq(settlementEntries.organizationId, organizationId),
          gte(settlementEntries.createdAt, from),
          lt(settlementEntries.createdAt, to),
        ),
      )
      .orderBy(desc(settlementEntries.createdAt));
    return rows.map(({ entry, ...rest }) => ({
      id: entry.id,
      bookingId: entry.bookingId,
      bookingCode: rest.bookingCode,
      route: rest.route,
      serviceDate: rest.serviceDate,
      seats: entry.seats,
      currency: entry.currency,
      gross: entry.gross,
      commissionRate: entry.commissionRate,
      commission: entry.commission,
      earned: entry.earned,
      createdAt: entry.createdAt.toISOString(),
    }));
  }

  async payouts(organizationId: string): Promise<Payout[]> {
    const rows = await this.database.db
      .select()
      .from(payouts)
      .where(eq(payouts.organizationId, organizationId))
      .orderBy(desc(payouts.createdAt));
    return rows.map(toPayout);
  }

  // --- Platform staff -------------------------------------------------------------------------

  /** Every operator with earnings, payouts or its own commission, by name. */
  async adminSummaries(): Promise<AdminSettlementSummary[]> {
    const ids = await this.database.db
      .selectDistinct({ id: settlementEntries.organizationId })
      .from(settlementEntries)
      .union(this.database.db.selectDistinct({ id: payouts.organizationId }).from(payouts))
      .union(
        this.database.db
          .select({ id: organizationCommissions.organizationId })
          .from(organizationCommissions),
      );
    if (!ids.length) return [];
    const orgs = await this.database.db
      .select({
        id: organizations.id,
        type: organizations.type,
        name: sql<string>`coalesce(${organizations.tradeName}, ${organizations.legalName})`,
      })
      .from(organizations)
      .where(
        inArray(
          organizations.id,
          ids.map((r) => r.id),
        ),
      );
    const summaries = new Map(
      (await this.summaries(orgs.map((o) => o.id))).map((s) => [s.organizationId, s]),
    );
    return orgs
      .map((organization) => ({ ...summaries.get(organization.id)!, organization }))
      .sort((a, b) => a.organization.name.localeCompare(b.organization.name, 'es'));
  }

  async setCommission(
    organizationId: string,
    rate: string | null,
    auth: Authenticated,
    meta: RequestMeta,
  ): Promise<OrganizationSettlement> {
    await this.requireOrganization(organizationId);
    if (rate === null) {
      await this.database.db
        .delete(organizationCommissions)
        .where(eq(organizationCommissions.organizationId, organizationId));
    } else {
      const value = normalizeRate(rate);
      await this.database.db
        .insert(organizationCommissions)
        .values({ organizationId, rate: value, updatedByUserId: auth.user.id })
        .onConflictDoUpdate({
          target: organizationCommissions.organizationId,
          set: { rate: value, updatedByUserId: auth.user.id, updatedAt: new Date() },
        });
    }
    await this.audit.record({
      action: 'settlement.commission_set',
      actorUserId: auth.user.id,
      targetType: 'organization',
      targetId: organizationId,
      ip: meta.ip,
      metadata: { rate: rate === null ? null : normalizeRate(rate) },
    });
    return this.settlement(organizationId);
  }

  /** Records money sent to an operator; never more than what is owed in that currency. */
  async createPayout(
    organizationId: string,
    input: CreatePayoutRequest,
    auth: Authenticated,
    meta: RequestMeta,
  ): Promise<Payout> {
    if (toScaled(input.amount, 2) <= 0n) throw invalid('The amount must be greater than zero');
    const payout = await this.database.db.transaction(async (tx) => {
      // One payout at a time per operator, so two cannot both spend the same balance.
      const [organization] = await tx
        .select({ id: organizations.id })
        .from(organizations)
        .where(eq(organizations.id, organizationId))
        .for('update');
      if (!organization) throw notFound('Organization not found');
      const [earned] = await tx
        .select({ earned: total(settlementEntries.earned) })
        .from(settlementEntries)
        .where(
          and(
            eq(settlementEntries.organizationId, organizationId),
            eq(settlementEntries.currency, input.currency),
          ),
        );
      const [paid] = await tx
        .select({ paid: total(payouts.amount) })
        .from(payouts)
        .where(
          and(
            eq(payouts.organizationId, organizationId),
            eq(payouts.currency, input.currency),
            isNull(payouts.voidedAt),
          ),
        );
      const balance = toScaled(earned!.earned, 2) - toScaled(paid!.paid, 2);
      if (toScaled(input.amount, 2) > balance) {
        throw ApiException.conflict(
          'The payout is larger than the balance owed in this currency',
          'PAYOUT_EXCEEDS_BALANCE',
        );
      }
      const [row] = await tx
        .insert(payouts)
        .values({
          organizationId,
          currency: input.currency,
          amount: fromScaled(toScaled(input.amount, 2), 2),
          method: input.method,
          reference: input.reference.trim(),
          note: input.note?.trim() || null,
          createdByUserId: auth.user.id,
        })
        .returning();
      return row!;
    });
    await this.audit.record({
      action: 'settlement.payout_created',
      actorUserId: auth.user.id,
      targetType: 'payout',
      targetId: payout.id,
      ip: meta.ip,
      metadata: {
        organizationId,
        currency: payout.currency,
        amount: payout.amount,
        method: payout.method,
      },
    });
    return toPayout(payout);
  }

  async voidPayout(
    payoutId: string,
    reason: string,
    auth: Authenticated,
    meta: RequestMeta,
  ): Promise<Payout> {
    const [row] = await this.database.db
      .update(payouts)
      .set({ voidedAt: new Date(), voidReason: reason.trim(), voidedByUserId: auth.user.id })
      .where(and(eq(payouts.id, payoutId), isNull(payouts.voidedAt)))
      .returning();
    if (!row) {
      const [existing] = await this.database.db
        .select({ id: payouts.id })
        .from(payouts)
        .where(eq(payouts.id, payoutId));
      if (!existing) throw notFound('Payout not found');
      throw ApiException.conflict('This payout was already voided', 'PAYOUT_ALREADY_VOIDED');
    }
    await this.audit.record({
      action: 'settlement.payout_voided',
      actorUserId: auth.user.id,
      targetType: 'payout',
      targetId: row.id,
      ip: meta.ip,
      metadata: { organizationId: row.organizationId, reason: row.voidReason },
    });
    return toPayout(row);
  }

  /** Payments whose money must go back to the payer, oldest first. */
  async refundsDue(): Promise<RefundDuePayment[]> {
    const rows = await this.database.db
      .select({
        payment: payments,
        bookingCode: bookings.code,
        organization: {
          id: organizations.id,
          name: sql<string>`coalesce(${organizations.tradeName}, ${organizations.legalName})`,
        },
        payer: {
          firstName: users.firstName,
          lastName: users.lastName,
          email: users.email,
          phone: users.phone,
        },
      })
      .from(payments)
      .innerJoin(bookings, eq(bookings.id, payments.bookingId))
      .innerJoin(trips, eq(trips.id, bookings.tripId))
      .innerJoin(organizations, eq(organizations.id, trips.organizationId))
      .innerJoin(users, eq(users.id, payments.userId))
      .where(eq(payments.status, 'refund_due'))
      .orderBy(payments.updatedAt);
    return rows.map(({ payment, payer, ...rest }) => ({
      paymentId: payment.id,
      bookingId: payment.bookingId,
      bookingCode: rest.bookingCode,
      organization: rest.organization,
      payer: {
        name: [payer.firstName, payer.lastName].filter(Boolean).join(' ') || null,
        email: payer.email,
        phone: payer.phone,
      },
      method: payment.method,
      currency: payment.currency,
      amount: payment.amount,
      receivedAmount: payment.receivedAmount,
      reference: payment.reference,
      providerReference: payment.providerReference,
      createdAt: payment.createdAt.toISOString(),
    }));
  }

  async markRefunded(
    paymentId: string,
    reference: string,
    auth: Authenticated,
    meta: RequestMeta,
  ): Promise<void> {
    const [row] = await this.database.db
      .update(payments)
      .set({
        status: 'refunded',
        refundedAt: new Date(),
        refundReference: reference.trim(),
        refundedByUserId: auth.user.id,
      })
      .where(and(eq(payments.id, paymentId), eq(payments.status, 'refund_due')))
      .returning({ id: payments.id, bookingId: payments.bookingId });
    if (!row) {
      const [existing] = await this.database.db
        .select({ id: payments.id })
        .from(payments)
        .where(eq(payments.id, paymentId));
      if (!existing) throw notFound('Payment not found');
      throw ApiException.conflict(
        'This payment is not awaiting a refund',
        'PAYMENT_NOT_REFUND_DUE',
      );
    }
    await this.audit.record({
      action: 'payment.refunded',
      actorUserId: auth.user.id,
      targetType: 'payment',
      targetId: row.id,
      ip: meta.ip,
      metadata: { bookingId: row.bookingId, reference: reference.trim() },
    });
  }

  // --- Helpers --------------------------------------------------------------------------------

  private async requireOrganization(organizationId: string): Promise<void> {
    const [row] = await this.database.db
      .select({ id: organizations.id })
      .from(organizations)
      .where(eq(organizations.id, organizationId));
    if (!row) throw notFound('Organization not found');
  }

  /** Commission and balances per currency for each organization (only those with data). */
  private async summaries(organizationIds: string[]): Promise<OrganizationSettlement[]> {
    if (!organizationIds.length) return [];
    const earned = await this.database.db
      .select({
        organizationId: settlementEntries.organizationId,
        currency: settlementEntries.currency,
        gross: total(settlementEntries.gross),
        commission: total(settlementEntries.commission),
        earned: total(settlementEntries.earned),
      })
      .from(settlementEntries)
      .where(inArray(settlementEntries.organizationId, organizationIds))
      .groupBy(settlementEntries.organizationId, settlementEntries.currency);
    const paid = await this.database.db
      .select({
        organizationId: payouts.organizationId,
        currency: payouts.currency,
        paidOut: total(payouts.amount),
      })
      .from(payouts)
      .where(and(inArray(payouts.organizationId, organizationIds), isNull(payouts.voidedAt)))
      .groupBy(payouts.organizationId, payouts.currency);
    const overrides = await this.database.db
      .select()
      .from(organizationCommissions)
      .where(inArray(organizationCommissions.organizationId, organizationIds));

    const totals = new Map<string, Totals>();
    for (const row of [...earned, ...paid] as Totals[]) {
      const key = `${row.organizationId}:${row.currency}`;
      totals.set(key, { ...totals.get(key), ...row });
    }
    const withData = new Set([
      ...[...totals.values()].map((t) => t.organizationId),
      ...overrides.map((o) => o.organizationId),
    ]);
    return organizationIds
      .filter((id) => withData.has(id))
      .map((organizationId) => {
        const override = overrides.find((o) => o.organizationId === organizationId)?.rate ?? null;
        return {
          organizationId,
          commissionRate: override ?? this.defaultRate,
          commissionOverride: override,
          balances: CURRENCIES.flatMap((currency) => {
            const t = totals.get(`${organizationId}:${currency}`);
            return t ? [balanceOf(t, currency)] : [];
          }),
        };
      });
  }
}

function balanceOf(t: Totals, currency: Currency): SettlementBalance {
  const earned = t.earned ?? '0.00';
  const paidOut = t.paidOut ?? '0.00';
  return {
    currency,
    gross: t.gross ?? '0.00',
    commission: t.commission ?? '0.00',
    earned,
    paidOut,
    balance: fromScaled(toScaled(earned, 2) - toScaled(paidOut, 2), 2),
  };
}

function toPayout(row: PayoutRow): Payout {
  return {
    id: row.id,
    organizationId: row.organizationId,
    currency: row.currency,
    amount: row.amount,
    method: row.method,
    reference: row.reference,
    note: row.note,
    createdAt: row.createdAt.toISOString(),
    voidedAt: row.voidedAt?.toISOString() ?? null,
    voidReason: row.voidReason,
  };
}

/** `2026-10` → [Oct 1 00:00, Nov 1 00:00) in Venezuelan time. */
export function monthRange(month: string): [Date, Date] {
  const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(month);
  if (!match) throw invalid('month must look like 2026-10');
  const year = Number(match[1]);
  const index = Number(match[2]);
  const next = index === 12 ? `${year + 1}-01` : `${year}-${String(index + 1).padStart(2, '0')}`;
  return [
    new Date(`${month}-01T00:00:00${NETWORK_UTC_OFFSET}`),
    new Date(`${next}-01T00:00:00${NETWORK_UTC_OFFSET}`),
  ];
}
