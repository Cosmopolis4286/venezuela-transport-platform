import { HttpStatus, Injectable } from '@nestjs/common';
import {
  CURRENCIES,
  formatPaymentAmount,
  NETWORK_UTC_OFFSET,
  todayInVenezuela,
  type AdminSettlementSummary,
  type CreatePayoutRequest,
  type Currency,
  type PaymentCollection,
  refundTiersProblem,
  type OrganizationSettlement,
  type Payout,
  type RefundTier,
  type SetOrganizationPolicyRequest,
  type SettlementPolicy,
  type UpdateSettlementPolicyRequest,
  ROUTE_OPERATOR_TYPES,
  type RefundDuePayment,
  type SettlementBalance,
  type SettlementEntry,
  type DriverBalance,
  type DriverEarnings,
  type DriverPayoutAccount,
} from '@vtp/shared-types';
import { and, desc, eq, gte, inArray, isNull, lt, or, sql, type AnyColumn } from 'drizzle-orm';
import { ApiException } from '../../common/errors/api.exception.js';
import { DatabaseService } from '../../database/database.service.js';
import { AuditService } from '../audit/audit.service.js';
import { bookings, trips } from '../bookings/bookings.schema.js';
import { users } from '../identity/identity.schema.js';
import type { Authenticated, RequestMeta } from '../identity/sessions.service.js';
import { routes } from '../network/network.schema.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { organizations } from '../organizations/organizations.schema.js';
import { fromScaled, toScaled } from '../payments/money.js';
import { payments } from '../payments/payments.schema.js';
import { collectedBy } from '../payments/payments.service.js';
import { normalizeRate } from './ledger.js';
import {
  organizationPolicies,
  driverPayoutAccounts,
  payouts,
  platformSettings,
  settlementEntries,
  type PayoutRow,
} from './settlements.schema.js';

const notFound = (message: string) => new ApiException('NOT_FOUND', message, HttpStatus.NOT_FOUND);
const invalid = (message: string) =>
  new ApiException('VALIDATION_FAILED', message, HttpStatus.BAD_REQUEST);

/** Sum of a numeric column as a two-decimal string ("0.00" when there are no rows). */
const total = (column: AnyColumn) => sql<string>`coalesce(sum(${column}), 0)::numeric(14, 2)::text`;

/** Fares the operator received itself (net of its refunds). */
const collectedTotal = sql<string>`coalesce(sum(${settlementEntries.gross}) filter (where ${settlementEntries.collectedBy} = 'operator'), 0)::numeric(14, 2)::text`;
const paidOutTotal = sql<string>`coalesce(sum(${payouts.amount}) filter (where ${payouts.direction} = 'to_operator' and ${payouts.driverUserId} is null), 0)::numeric(14, 2)::text`;
const receivedTotal = sql<string>`coalesce(sum(${payouts.amount}) filter (where ${payouts.direction} = 'from_operator'), 0)::numeric(14, 2)::text`;
/** What the organization itself earned; fares of routes paid to drivers are theirs (ADR-030). */
const earnedTotal = sql<string>`coalesce(sum(${settlementEntries.earned}) filter (where ${settlementEntries.payee} = 'organization'), 0)::numeric(14, 2)::text`;
const forDriversTotal = sql<string>`coalesce(sum(${settlementEntries.earned}) filter (where ${settlementEntries.payee} = 'driver'), 0)::numeric(14, 2)::text`;
const fullName = sql<string>`trim(coalesce(${users.firstName}, '') || ' ' || coalesce(${users.lastName}, ''))`;

const organizationColumns = {
  id: organizations.id,
  type: organizations.type,
  name: sql<string>`coalesce(${organizations.tradeName}, ${organizations.legalName})`,
};

interface Totals {
  organizationId: string;
  currency: Currency;
  gross?: string;
  commission?: string;
  earned?: string;
  collected?: string;
  paidOut?: string;
  received?: string;
  forDrivers?: string;
}

@Injectable()
export class SettlementsService {
  constructor(
    private readonly database: DatabaseService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  // --- Operators ------------------------------------------------------------------------------

  async settlement(organizationId: string): Promise<OrganizationSettlement> {
    const [summary] = await this.summaries([organizationId]);
    return summary!;
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
      kind: entry.kind,
      collectedBy: entry.collectedBy,
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
      .select({ payout: payouts, driverName: fullName })
      .from(payouts)
      .leftJoin(users, eq(users.id, payouts.driverUserId))
      .where(eq(payouts.organizationId, organizationId))
      .orderBy(desc(payouts.createdAt));
    return rows.map(({ payout, driverName }) => toPayout(payout, driverName));
  }

  // --- Drivers (ADR-030) ----------------------------------------------------------------------

  /**
   * What each driver earned on routes paid to drivers, per organization and currency, minus what
   * the platform paid them. Sales on trips with no driver yet appear with `driver: null`.
   */
  async driverBalances(
    organizationIds: string[],
    db: Pick<DatabaseService['db'], 'select'> = this.database.db,
    driverUserId?: string,
  ): Promise<Map<string, DriverBalance[]>> {
    const result = new Map<string, DriverBalance[]>();
    if (!organizationIds.length && !driverUserId) return result;
    // The trip's driver, or on an open ticket the driver who validated it (ADR-032).
    const driver = sql<
      string | null
    >`coalesce(${bookings.boardingDriverUserId}, ${trips.driverUserId})`;
    const scope = driverUserId
      ? sql`${driver} = ${driverUserId}`
      : inArray(settlementEntries.organizationId, organizationIds);
    const earned = await db
      .select({
        organizationId: settlementEntries.organizationId,
        driverId: driver,
        currency: settlementEntries.currency,
        earned: total(settlementEntries.earned),
      })
      .from(settlementEntries)
      .innerJoin(bookings, eq(bookings.id, settlementEntries.bookingId))
      .innerJoin(trips, eq(trips.id, bookings.tripId))
      .where(and(eq(settlementEntries.payee, 'driver'), scope))
      .groupBy(settlementEntries.organizationId, driver, settlementEntries.currency);
    const paid = await db
      .select({
        organizationId: payouts.organizationId,
        driverId: payouts.driverUserId,
        currency: payouts.currency,
        paidOut: total(payouts.amount),
      })
      .from(payouts)
      .where(
        and(
          isNull(payouts.voidedAt),
          driverUserId
            ? eq(payouts.driverUserId, driverUserId)
            : and(
                inArray(payouts.organizationId, organizationIds),
                sql`${payouts.driverUserId} is not null`,
              ),
        ),
      )
      .groupBy(payouts.organizationId, payouts.driverUserId, payouts.currency);
    const driverIds = [
      ...new Set([...earned, ...paid].map((r) => r.driverId).filter((id): id is string => !!id)),
    ];
    const people = driverIds.length
      ? await db
          .select({ id: users.id, name: fullName, account: driverPayoutAccounts })
          .from(users)
          .leftJoin(driverPayoutAccounts, eq(driverPayoutAccounts.userId, users.id))
          .where(inArray(users.id, driverIds))
      : [];
    const keyOf = (r: { organizationId: string; driverId: string | null; currency: Currency }) =>
      `${r.organizationId}|${r.driverId ?? ''}|${r.currency}`;
    const rows = new Map<
      string,
      {
        organizationId: string;
        driverId: string | null;
        currency: Currency;
        earned: string;
        paidOut: string;
      }
    >();
    for (const r of earned) rows.set(keyOf(r), { ...r, paidOut: '0.00' });
    for (const r of paid) {
      const current = rows.get(keyOf(r));
      rows.set(keyOf(r), { ...r, earned: current?.earned ?? '0.00', paidOut: r.paidOut });
    }
    for (const r of rows.values()) {
      const person = people.find((p) => p.id === r.driverId);
      const balance: DriverBalance = {
        driver: r.driverId ? { id: r.driverId, name: person?.name || '—' } : null,
        currency: r.currency,
        earned: r.earned,
        paidOut: r.paidOut,
        balance: fromScaled(toScaled(r.earned, 2) - toScaled(r.paidOut, 2), 2),
        payoutAccount: person?.account ? toPayoutAccount(person.account) : null,
      };
      result.set(r.organizationId, [...(result.get(r.organizationId) ?? []), balance]);
    }
    for (const list of result.values()) {
      list.sort((a, b) => (a.driver?.name ?? '~').localeCompare(b.driver?.name ?? '~', 'es'));
    }
    return result;
  }

  /** `GET /me/earnings`: the signed-in driver's balances with each organization. */
  async driverEarnings(userId: string): Promise<DriverEarnings> {
    const byOrganization = await this.driverBalances([], this.database.db, userId);
    const ids = [...byOrganization.keys()];
    const names = ids.length
      ? await this.database.db
          .select({
            id: organizations.id,
            name: sql<string>`coalesce(${organizations.tradeName}, ${organizations.legalName})`,
          })
          .from(organizations)
          .where(inArray(organizations.id, ids))
      : [];
    const [account] = await this.database.db
      .select()
      .from(driverPayoutAccounts)
      .where(eq(driverPayoutAccounts.userId, userId));
    return {
      balances: [...byOrganization.entries()].flatMap(([organizationId, list]) =>
        list.map(({ driver: _driver, payoutAccount: _account, ...rest }) => ({
          ...rest,
          organization: {
            id: organizationId,
            name: names.find((n) => n.id === organizationId)?.name ?? '—',
          },
        })),
      ),
      payoutAccount: account ? toPayoutAccount(account) : null,
    };
  }

  async setPayoutAccount(
    userId: string,
    input: DriverPayoutAccount,
    meta: RequestMeta,
  ): Promise<DriverPayoutAccount> {
    const values = {
      method: input.method,
      bank: input.bank.trim(),
      account: input.account.trim(),
      holderId: input.holderId.trim().toUpperCase(),
      holderName: input.holderName.trim(),
    };
    const [row] = await this.database.db
      .insert(driverPayoutAccounts)
      .values({ userId, ...values })
      .onConflictDoUpdate({
        target: driverPayoutAccounts.userId,
        set: { ...values, updatedAt: new Date() },
      })
      .returning();
    await this.audit.record({
      action: 'settlement.payout_account_set',
      actorUserId: userId,
      targetType: 'user',
      targetId: userId,
      ip: meta.ip,
      metadata: { method: values.method },
    });
    return toPayoutAccount(row!);
  }

  // --- Platform staff -------------------------------------------------------------------------

  /** Active bus companies, plus any operator with earnings or payouts, by name. */
  async adminSummaries(): Promise<AdminSettlementSummary[]> {
    const withMoney = this.database.db
      .selectDistinct({ id: settlementEntries.organizationId })
      .from(settlementEntries)
      .union(this.database.db.selectDistinct({ id: payouts.organizationId }).from(payouts));
    const orgs = await this.database.db
      .select(organizationColumns)
      .from(organizations)
      .where(
        or(
          and(
            eq(organizations.status, 'active'),
            inArray(organizations.type, [...ROUTE_OPERATOR_TYPES]),
          ),
          inArray(organizations.id, withMoney),
        ),
      );
    const summaries = await this.summaries(orgs.map((o) => o.id));
    return orgs
      .map((organization, i) => ({ ...summaries[i]!, organization }))
      .sort((a, b) => a.organization.name.localeCompare(b.organization.name, 'es'));
  }

  async adminSummary(organizationId: string): Promise<AdminSettlementSummary> {
    const [organization] = await this.database.db
      .select(organizationColumns)
      .from(organizations)
      .where(eq(organizations.id, organizationId));
    if (!organization) throw notFound('Organization not found');
    return { ...(await this.settlement(organizationId)), organization };
  }

  async platformPolicy(): Promise<SettlementPolicy> {
    const [row] = await this.database.db
      .select()
      .from(platformSettings)
      .where(eq(platformSettings.id, 1));
    if (!row) throw new Error('platform_settings has no row: run the migrations');
    return {
      commissionRate: row.commissionRate,
      refundTiers: row.refundTiers,
      suburbanRefundTiers: row.suburbanRefundTiers,
    };
  }

  /** The defaults for every operator without its own values. Applies from now on. */
  async setPlatformPolicy(
    input: UpdateSettlementPolicyRequest,
    auth: Authenticated,
    meta: RequestMeta,
  ): Promise<SettlementPolicy> {
    const refundTiers = checkTiers(input.refundTiers);
    const suburbanRefundTiers = input.suburbanRefundTiers
      ? checkTiers(input.suburbanRefundTiers)
      : undefined;
    const commissionRate = normalizeRate(input.commissionRate);
    await this.database.db
      .update(platformSettings)
      .set({
        commissionRate,
        refundTiers,
        ...(suburbanRefundTiers ? { suburbanRefundTiers } : {}),
        updatedByUserId: auth.user.id,
        updatedAt: new Date(),
      })
      .where(eq(platformSettings.id, 1));
    await this.audit.record({
      action: 'settlement.platform_policy_set',
      actorUserId: auth.user.id,
      ip: meta.ip,
      metadata: { commissionRate, refundTiers, suburbanRefundTiers },
    });
    return this.platformPolicy();
  }

  /** An operator's own commission and refund tiers; null fields use the platform's. */
  async setOrganizationPolicy(
    organizationId: string,
    input: SetOrganizationPolicyRequest,
    auth: Authenticated,
    meta: RequestMeta,
  ): Promise<OrganizationSettlement> {
    await this.requireOrganization(organizationId);
    const commissionRate =
      input.commissionRate === null ? null : normalizeRate(input.commissionRate);
    const refundTiers = input.refundTiers === null ? null : checkTiers(input.refundTiers);
    const [current] = await this.database.db
      .select({ paymentCollection: organizationPolicies.paymentCollection })
      .from(organizationPolicies)
      .where(eq(organizationPolicies.organizationId, organizationId));
    // Stored only when the operator collects; null means the platform does.
    const collection: PaymentCollection | null =
      input.paymentCollection === undefined
        ? (current?.paymentCollection ?? null)
        : input.paymentCollection === 'operator'
          ? 'operator'
          : null;
    if (commissionRate === null && refundTiers === null && collection === null) {
      await this.database.db
        .delete(organizationPolicies)
        .where(eq(organizationPolicies.organizationId, organizationId));
    } else {
      const values = {
        commissionRate,
        refundTiers,
        paymentCollection: collection,
        updatedByUserId: auth.user.id,
      };
      await this.database.db
        .insert(organizationPolicies)
        .values({ organizationId, ...values })
        .onConflictDoUpdate({
          target: organizationPolicies.organizationId,
          set: { ...values, updatedAt: new Date() },
        });
    }
    await this.audit.record({
      action: 'settlement.organization_policy_set',
      actorUserId: auth.user.id,
      targetType: 'organization',
      targetId: organizationId,
      ip: meta.ip,
      metadata: { commissionRate, refundTiers, paymentCollection: collection ?? 'platform' },
    });
    return this.settlement(organizationId);
  }

  /**
   * Records money sent to an operator (never more than what it is owed in that currency), or
   * received from one that collects itself (never more than what it owes).
   */
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
      const direction = input.direction ?? 'to_operator';
      if (input.driverUserId) {
        if (direction !== 'to_operator') throw invalid('Drivers are only paid, never charged');
        const [owed] = (await this.driverBalances([organizationId], tx))
          .get(organizationId)
          ?.filter((d) => d.driver?.id === input.driverUserId && d.currency === input.currency) ?? [
          undefined,
        ];
        if (!owed || toScaled(input.amount, 2) > toScaled(owed.balance, 2)) {
          throw ApiException.conflict(
            'The payout is larger than what this driver is owed in this currency',
            'PAYOUT_EXCEEDS_BALANCE',
          );
        }
        const [row] = await tx
          .insert(payouts)
          .values({
            organizationId,
            driverUserId: input.driverUserId,
            direction,
            currency: input.currency,
            amount: fromScaled(toScaled(input.amount, 2), 2),
            method: input.method,
            reference: input.reference.trim(),
            note: input.note?.trim() || null,
            createdByUserId: auth.user.id,
          })
          .returning();
        return row!;
      }
      const [ledger] = await tx
        .select({
          earned: earnedTotal,
          collected: collectedTotal,
        })
        .from(settlementEntries)
        .where(
          and(
            eq(settlementEntries.organizationId, organizationId),
            eq(settlementEntries.currency, input.currency),
          ),
        );
      const [moved] = await tx
        .select({ paidOut: paidOutTotal, received: receivedTotal })
        .from(payouts)
        .where(
          and(
            eq(payouts.organizationId, organizationId),
            eq(payouts.currency, input.currency),
            isNull(payouts.voidedAt),
          ),
        );
      const balance = toScaled(
        balanceOf({ ...ledger!, ...moved! } as Totals, input.currency).balance,
        2,
      );
      if (direction === 'to_operator' && toScaled(input.amount, 2) > balance) {
        throw ApiException.conflict(
          'The payout is larger than the balance owed in this currency',
          'PAYOUT_EXCEEDS_BALANCE',
        );
      }
      if (direction === 'from_operator' && toScaled(input.amount, 2) > -balance) {
        throw ApiException.conflict(
          'The amount is larger than what the operator owes in this currency',
          'COLLECTION_EXCEEDS_DEBT',
        );
      }
      const [row] = await tx
        .insert(payouts)
        .values({
          organizationId,
          direction,
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
        direction: payout.direction,
        currency: payout.currency,
        amount: payout.amount,
        method: payout.method,
        ...(payout.driverUserId ? { driverUserId: payout.driverUserId } : {}),
      },
    });
    return (await this.payouts(organizationId)).find((p) => p.id === payout.id)!;
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
    return (await this.payouts(row.organizationId)).find((p) => p.id === row.id)!;
  }

  /**
   * Payments whose money must go back to the payer, oldest first: those the platform received
   * (`collector` null) or those one operator received in its own accounts.
   */
  async refundsDue(collector: string | null): Promise<RefundDuePayment[]> {
    const rows = await this.database.db
      .select({
        payment: payments,
        bookingCode: bookings.code,
        organization: { id: organizations.id, name: organizationColumns.name },
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
      .where(and(eq(payments.status, 'refund_due'), collectedBy(collector)))
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
      refundAmount: payment.refundAmount ?? payment.receivedAmount ?? payment.amount,
      cancellation: payment.refundAmount !== null,
      reference: payment.reference,
      providerReference: payment.providerReference,
      createdAt: payment.createdAt.toISOString(),
    }));
  }

  async markRefunded(
    paymentId: string,
    collector: string | null,
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
      .where(
        and(eq(payments.id, paymentId), eq(payments.status, 'refund_due'), collectedBy(collector)),
      )
      .returning({ id: payments.id, bookingId: payments.bookingId });
    if (!row) {
      const [existing] = await this.database.db
        .select({ id: payments.id })
        .from(payments)
        .where(and(eq(payments.id, paymentId), collectedBy(collector)));
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
    this.notifications.later(async () => {
      const [payment] = await this.database.db
        .select()
        .from(payments)
        .where(eq(payments.id, row.id));
      const booking = await this.notifications.booking(row.bookingId);
      return {
        kind: 'refund_sent',
        userIds: [payment!.userId],
        app: 'passenger',
        email: true,
        reference: { key: 'bookingId', id: row.bookingId },
        text: (m, locale) =>
          m.refundSent(
            booking.code,
            formatPaymentAmount(
              payment!.refundAmount ?? payment!.receivedAmount ?? payment!.amount,
              payment!.currency,
              locale,
            ),
            reference.trim(),
          ),
      };
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

  /** Commission and balances per currency, one per organization id, in the same order. */
  private async summaries(organizationIds: string[]): Promise<OrganizationSettlement[]> {
    if (!organizationIds.length) return [];
    const earned = await this.database.db
      .select({
        organizationId: settlementEntries.organizationId,
        currency: settlementEntries.currency,
        gross: total(settlementEntries.gross),
        commission: total(settlementEntries.commission),
        earned: earnedTotal,
        forDrivers: forDriversTotal,
        collected: collectedTotal,
      })
      .from(settlementEntries)
      .where(inArray(settlementEntries.organizationId, organizationIds))
      .groupBy(settlementEntries.organizationId, settlementEntries.currency);
    const paid = await this.database.db
      .select({
        organizationId: payouts.organizationId,
        currency: payouts.currency,
        paidOut: paidOutTotal,
        received: receivedTotal,
      })
      .from(payouts)
      .where(and(inArray(payouts.organizationId, organizationIds), isNull(payouts.voidedAt)))
      .groupBy(payouts.organizationId, payouts.currency);
    const platform = await this.platformPolicy();
    const overrides = await this.database.db
      .select()
      .from(organizationPolicies)
      .where(inArray(organizationPolicies.organizationId, organizationIds));

    const drivers = await this.driverBalances(organizationIds);
    const totals = new Map<string, Totals>();
    for (const row of [...earned, ...paid] as Totals[]) {
      const key = `${row.organizationId}:${row.currency}`;
      totals.set(key, { ...totals.get(key), ...row });
    }
    return organizationIds.map((organizationId) => {
      const own = overrides.find((o) => o.organizationId === organizationId);
      return {
        organizationId,
        commissionRate: own?.commissionRate ?? platform.commissionRate,
        commissionOverride: own?.commissionRate ?? null,
        refundTiers: own?.refundTiers ?? platform.refundTiers,
        refundTiersOverride: own?.refundTiers ?? null,
        suburbanRefundTiers: platform.suburbanRefundTiers,
        paymentCollection: own?.paymentCollection ?? 'platform',
        balances: CURRENCIES.flatMap((currency) => {
          const t = totals.get(`${organizationId}:${currency}`);
          return t ? [balanceOf(t, currency)] : [];
        }),
        drivers: drivers.get(organizationId) ?? [],
      };
    });
  }
}

/** Validated tiers, or a 400 explaining what is wrong. */
function checkTiers(tiers: RefundTier[]): RefundTier[] {
  const problem = refundTiersProblem(tiers);
  if (problem) throw invalid(problem);
  return tiers.map(({ hoursBefore, percent }) => ({ hoursBefore, percent }));
}

function balanceOf(t: Totals, currency: Currency): SettlementBalance {
  const earned = t.earned ?? '0.00';
  const collected = t.collected ?? '0.00';
  const paidOut = t.paidOut ?? '0.00';
  const received = t.received ?? '0.00';
  const s = (amount: string) => toScaled(amount, 2);
  return {
    currency,
    gross: t.gross ?? '0.00',
    commission: t.commission ?? '0.00',
    earned,
    collected,
    paidOut,
    received,
    forDrivers: t.forDrivers ?? '0.00',
    balance: fromScaled(s(earned) - s(collected) - s(paidOut) + s(received), 2),
  };
}

function toPayoutAccount(row: typeof driverPayoutAccounts.$inferSelect): DriverPayoutAccount {
  return {
    method: row.method,
    bank: row.bank,
    account: row.account,
    holderId: row.holderId,
    holderName: row.holderName,
  };
}

function toPayout(row: PayoutRow, driverName?: string | null): Payout {
  return {
    id: row.id,
    organizationId: row.organizationId,
    driver: row.driverUserId ? { id: row.driverUserId, name: driverName || '—' } : null,
    direction: row.direction,
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
