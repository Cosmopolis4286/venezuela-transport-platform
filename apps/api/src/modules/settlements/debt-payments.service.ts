import { HttpStatus, Injectable } from '@nestjs/common';
import {
  DEBT_PAYMENT_METHODS,
  PLATFORM_ROLES,
  formatMoney,
  platformRoleHasPermission,
  type DriverDebt,
  type DriverDebtReport,
  type DriverDebtReportForReview,
  type ReportDebtPaymentRequest,
} from '@vtp/shared-types';
import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { ApiException } from '../../common/errors/api.exception.js';
import { DatabaseService } from '../../database/database.service.js';
import { AuditService } from '../audit/audit.service.js';
import { users } from '../identity/identity.schema.js';
import type { Authenticated, RequestMeta } from '../identity/sessions.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { fromScaled, toScaled } from '../payments/money.js';
import { paymentAccounts } from '../payments/payments.schema.js';
import { organizations } from '../organizations/organizations.schema.js';
import { driverDebtReports, type DriverDebtReportRow } from './settlements.schema.js';
import { SettlementsService } from './settlements.service.js';

const conflict = ApiException.conflict;
const invalid = (message: string) =>
  new ApiException('VALIDATION_FAILED', message, HttpStatus.BAD_REQUEST);
const notFound = () =>
  new ApiException('NOT_FOUND', 'Debt payment report not found', HttpStatus.NOT_FOUND);
/** Platform roles that verify money: they hear about each report. */
const FINANCE_ROLES = PLATFORM_ROLES.filter((r) => platformRoleHasPermission(r, 'finance.manage'));

/**
 * Independent drivers pay their commission debt (ADR-046): they transfer to the platform's
 * accounts and report it; finance confirms it (recorded as a collection) or rejects it.
 */
@Injectable()
export class DebtPaymentsService {
  constructor(
    private readonly database: DatabaseService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    private readonly settlements: SettlementsService,
  ) {}

  /** What the driver owes each line of the platform, where to pay it, and their last report. */
  async debts(userId: string): Promise<DriverDebt[]> {
    const db = this.database.db;
    const balances = await this.settlements.driverBalances([], db, userId);
    const ids = [...balances.keys()];
    const lines = ids.length
      ? await db
          .select({
            id: organizations.id,
            name: sql<string>`coalesce(${organizations.tradeName}, ${organizations.legalName})`,
          })
          .from(organizations)
          .where(and(inArray(organizations.id, ids), eq(organizations.operatedByPlatform, true)))
      : [];
    const accounts = await db
      .select({ method: paymentAccounts.method, fields: paymentAccounts.fields })
      .from(paymentAccounts)
      .where(and(isNull(paymentAccounts.organizationId), eq(paymentAccounts.active, true)));
    const reports = await db
      .select()
      .from(driverDebtReports)
      .where(eq(driverDebtReports.userId, userId))
      .orderBy(desc(driverDebtReports.createdAt))
      .limit(50);
    return lines.flatMap((line) =>
      (balances.get(line.id) ?? []).flatMap((b) => {
        const last = reports.find((r) => r.organizationId === line.id && r.currency === b.currency);
        const waiting = last?.status === 'reported';
        // Nothing owed and nothing waiting: nothing to show.
        if (toScaled(b.balance, 2) >= 0n && !waiting) return [];
        return [
          {
            organization: line,
            currency: b.currency,
            amount: fromScaled(-toScaled(b.balance, 2) > 0n ? -toScaled(b.balance, 2) : 0n, 2),
            accounts: accounts.filter((a) => DEBT_PAYMENT_METHODS[b.currency].includes(a.method)),
            report: last && last.status !== 'confirmed' ? toReport(last) : null,
          },
        ];
      }),
    );
  }

  async report(
    auth: Authenticated,
    input: ReportDebtPaymentRequest,
    meta: RequestMeta,
  ): Promise<DriverDebt[]> {
    const amount = toScaled(input.amount, 2);
    if (amount <= 0n) throw invalid('The amount must be greater than zero');
    const reference = input.reference.trim();
    if (!reference) throw invalid('Type the operation number');
    const debt = (await this.debts(auth.user.id)).find(
      (d) => d.organization.id === input.organizationId && d.currency === input.currency,
    );
    if (!debt || amount > toScaled(debt.amount, 2)) {
      throw conflict('The amount is larger than what you owe', 'COLLECTION_EXCEEDS_DEBT');
    }
    if (!debt.accounts.some((a) => a.method === input.method)) {
      throw conflict('The platform has no account for that method', 'PAYMENT_METHOD_UNAVAILABLE');
    }
    const [row] = await this.database.db
      .insert(driverDebtReports)
      .values({
        userId: auth.user.id,
        organizationId: input.organizationId,
        currency: input.currency,
        amount: fromScaled(amount, 2),
        method: input.method,
        reference,
      })
      .onConflictDoNothing()
      .returning();
    if (!row) throw conflict('A reported payment is being checked', 'DEBT_REPORT_PENDING');
    await this.audit.record({
      action: 'settlement.debt_payment_reported',
      actorUserId: auth.user.id,
      targetType: 'organization',
      targetId: input.organizationId,
      ip: meta.ip,
      metadata: { currency: row.currency, amount: row.amount, method: row.method },
    });
    const name =
      [auth.user.firstName, auth.user.lastName].filter(Boolean).join(' ') || 'Un conductor';
    this.notifications.later(async () => ({
      kind: 'debt_payment',
      userIds: (
        await this.database.db
          .select({ id: users.id })
          .from(users)
          .where(inArray(users.platformRole, FINANCE_ROLES))
      ).map((u) => u.id),
      app: 'transport',
      email: true,
      text: (m, locale) =>
        m.debtPaymentReported(name, formatMoney(row.amount, row.currency, locale)),
    }));
    return this.debts(auth.user.id);
  }

  /** Reports waiting for finance, oldest first, with what each driver owes now. */
  async waiting(): Promise<DriverDebtReportForReview[]> {
    const rows = await this.database.db
      .select({
        report: driverDebtReports,
        name: sql<string>`trim(coalesce(${users.firstName}, '') || ' ' || coalesce(${users.lastName}, ''))`,
        phone: users.phone,
        line: sql<string>`coalesce(${organizations.tradeName}, ${organizations.legalName})`,
      })
      .from(driverDebtReports)
      .innerJoin(users, eq(users.id, driverDebtReports.userId))
      .innerJoin(organizations, eq(organizations.id, driverDebtReports.organizationId))
      .where(eq(driverDebtReports.status, 'reported'))
      .orderBy(driverDebtReports.createdAt)
      .limit(100);
    const balances = rows.length
      ? await this.settlements.driverBalances([
          ...new Set(rows.map((r) => r.report.organizationId)),
        ])
      : new Map();
    return rows.map(({ report, name, phone, line }) => {
      const balance = (balances.get(report.organizationId) ?? []).find(
        (b: { driver: { id: string } | null; currency: string }) =>
          b.driver?.id === report.userId && b.currency === report.currency,
      ) as { balance: string } | undefined;
      const owed = balance ? -toScaled(balance.balance, 2) : 0n;
      return {
        ...toReport(report),
        driver: { id: report.userId, name: name || '—', phone },
        line,
        owed: fromScaled(owed > 0n ? owed : 0n, 2),
      };
    });
  }

  /** The money arrived: recorded as the driver's payment, never above what they owe now. */
  async confirm(
    auth: Authenticated,
    reportId: string,
    meta: RequestMeta,
  ): Promise<DriverDebtReport> {
    const db = this.database.db;
    // Claim it first, so two confirmations never record the money twice.
    const [claimed] = await db
      .update(driverDebtReports)
      .set({ status: 'confirmed', reviewedBy: auth.user.id, reviewedAt: new Date() })
      .where(and(eq(driverDebtReports.id, reportId), eq(driverDebtReports.status, 'reported')))
      .returning();
    if (!claimed) throw await this.notWaiting(reportId);
    let payoutId: string;
    try {
      payoutId = (
        await this.settlements.createPayout(
          claimed.organizationId,
          {
            direction: 'from_operator',
            driverUserId: claimed.userId,
            currency: claimed.currency,
            amount: claimed.amount,
            method:
              claimed.method === 'bank_transfer'
                ? 'bank_transfer'
                : claimed.method === 'usdt'
                  ? 'usdt'
                  : 'pago_movil',
            reference: claimed.reference,
            note: 'Pago de comisiones reportado por el conductor',
          },
          auth,
          meta,
        )
      ).id;
    } catch (error) {
      await db
        .update(driverDebtReports)
        .set({ status: 'reported', reviewedBy: null, reviewedAt: null })
        .where(eq(driverDebtReports.id, reportId));
      throw error;
    }
    const [row] = await db
      .update(driverDebtReports)
      .set({ payoutId })
      .where(eq(driverDebtReports.id, reportId))
      .returning();
    this.tell(row!, true);
    return toReport(row!);
  }

  async reject(
    auth: Authenticated,
    reportId: string,
    reason: string,
    meta: RequestMeta,
  ): Promise<DriverDebtReport> {
    const why = reason.trim();
    if (!why) throw invalid('Explain why in reason');
    const [row] = await this.database.db
      .update(driverDebtReports)
      .set({
        status: 'rejected',
        rejectionReason: why,
        reviewedBy: auth.user.id,
        reviewedAt: new Date(),
      })
      .where(and(eq(driverDebtReports.id, reportId), eq(driverDebtReports.status, 'reported')))
      .returning();
    if (!row) throw await this.notWaiting(reportId);
    await this.audit.record({
      action: 'settlement.debt_payment_rejected',
      actorUserId: auth.user.id,
      targetType: 'organization',
      targetId: row.organizationId,
      ip: meta.ip,
    });
    this.tell(row, false);
    return toReport(row);
  }

  private tell(row: DriverDebtReportRow, confirmed: boolean) {
    this.notifications.send({
      kind: 'debt_payment',
      userIds: [row.userId],
      app: 'transport',
      email: true,
      text: (m, locale) =>
        m.debtPaymentReviewed(
          formatMoney(row.amount, row.currency, locale),
          confirmed,
          row.rejectionReason,
        ),
    });
  }

  private async notWaiting(reportId: string): Promise<ApiException> {
    const [exists] = await this.database.db
      .select({ id: driverDebtReports.id })
      .from(driverDebtReports)
      .where(eq(driverDebtReports.id, reportId));
    return exists ? conflict('This report was already reviewed', 'RELOAD_AND_RETRY') : notFound();
  }
}

function toReport(row: DriverDebtReportRow): DriverDebtReport {
  return {
    id: row.id,
    organizationId: row.organizationId,
    currency: row.currency,
    amount: row.amount,
    method: row.method,
    reference: row.reference,
    status: row.status,
    rejectionReason: row.rejectionReason,
    createdAt: row.createdAt.toISOString(),
    reviewedAt: row.reviewedAt?.toISOString() ?? null,
  };
}
