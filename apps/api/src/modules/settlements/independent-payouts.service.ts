import {
  HttpStatus,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import {
  COMMISSION_PATTERN,
  DRIVER_DEBT_LIMIT,
  DRIVER_PAYOUT_MINIMUM,
  INDEPENDENT_COMMISSION_NOTICE_DAYS,
  formatMoney,
  longDate,
  toNetworkIso,
  type DriverPayoutRun,
  type IndependentCommission,
  type Payout,
  type PendingDriverPayout,
} from '@vtp/shared-types';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { randomBytes } from 'node:crypto';
import { ApiException } from '../../common/errors/api.exception.js';
import { AppConfigService } from '../../config/app-config.service.js';
import { DatabaseService } from '../../database/database.service.js';
import { AuditService } from '../audit/audit.service.js';
import { users } from '../identity/identity.schema.js';
import type { Authenticated, RequestMeta } from '../identity/sessions.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { toScaled } from '../payments/money.js';
import { memberships, organizations } from '../organizations/organizations.schema.js';
import { independentCommission, independentCommissionAt } from './ledger.js';
import { driverPayoutAccounts, payouts, platformSettings } from './settlements.schema.js';
import { SettlementsService, toPayout } from './settlements.service.js';

const SWEEP_EVERY_MS = 60 * 60_000;
/** Payouts go out on Mondays from this hour, Venezuelan time. */
const RUN_WEEKDAY = 1;
const RUN_HOUR = 9;

const conflict = ApiException.conflict;
const invalid = (message: string) =>
  new ApiException('VALIDATION_FAILED', message, HttpStatus.BAD_REQUEST);

/** ISO week of a moment in Venezuela (UTC−4 all year), e.g. `2026-W47`. */
export function isoWeek(at: Date): string {
  const local = new Date(at.getTime() - 4 * 3_600_000);
  const day = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()));
  // The Thursday of this week decides its year; weeks start on Monday.
  day.setUTCDate(day.getUTCDate() - ((day.getUTCDay() + 6) % 7) + 3);
  const yearStart = Date.UTC(day.getUTCFullYear(), 0, 1);
  const week = Math.floor((day.getTime() - yearStart) / 86_400_000 / 7) + 1;
  return `${day.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

/**
 * Independent drivers' money (ADR-045): the platform's commission on their rides, the weekly
 * automatic payouts of what they are owed, and the debt limit that keeps them offline.
 */
@Injectable()
export class IndependentPayoutsService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(IndependentPayoutsService.name);
  private timer: NodeJS.Timeout | undefined;

  constructor(
    private readonly database: DatabaseService,
    private readonly config: AppConfigService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    private readonly settlements: SettlementsService,
  ) {}

  onApplicationBootstrap(): void {
    // Tests call run() themselves.
    if (this.config.get('NODE_ENV') === 'test') return;
    this.timer = setInterval(() => {
      const now = new Date();
      const local = new Date(now.getTime() - 4 * 3_600_000);
      if (local.getUTCDay() !== RUN_WEEKDAY || local.getUTCHours() < RUN_HOUR) return;
      this.run(now).catch((error: unknown) =>
        this.logger.error(`Driver payout run failed: ${(error as Error).message}`),
      );
    }, SWEEP_EVERY_MS);
    this.timer.unref();
  }

  onApplicationShutdown(): void {
    clearInterval(this.timer);
  }

  // --- Commission ---------------------------------------------------------------------------

  commission(now = new Date()): Promise<IndependentCommission> {
    return independentCommission(this.database.db, now);
  }

  /**
   * A higher commission starts `INDEPENDENT_COMMISSION_NOTICE_DAYS` from now, announced to every
   * independent driver (Conditions 4.2); a lower or equal one at once.
   */
  async setCommission(
    auth: Authenticated,
    rate: string,
    meta: RequestMeta,
    now = new Date(),
  ): Promise<IndependentCommission> {
    if (!COMMISSION_PATTERN.test(rate)) throw invalid('Use a percentage from 0 to 100');
    const value = (Number(rate) || 0).toFixed(2);
    const current = await independentCommissionAt(this.database.db, now);
    const raise = toScaled(value, 2) > toScaled(current, 2);
    const from = raise
      ? new Date(now.getTime() + INDEPENDENT_COMMISSION_NOTICE_DAYS * 86_400_000)
      : now;
    await this.database.db
      .update(platformSettings)
      .set(
        raise
          ? {
              // What already applies stays until the new rate starts.
              independentCommissionRate: current,
              independentCommissionNextRate: value,
              independentCommissionNextFrom: from,
              updatedByUserId: auth.user.id,
            }
          : {
              independentCommissionRate: value,
              independentCommissionNextRate: null,
              independentCommissionNextFrom: null,
              updatedByUserId: auth.user.id,
            },
      )
      .where(eq(platformSettings.id, 1));
    await this.audit.record({
      action: 'settlement.independent_commission_set',
      actorUserId: auth.user.id,
      targetType: 'platform_settings',
      targetId: '1',
      ip: meta.ip,
      metadata: { from: current, to: value, startsAt: from.toISOString() },
    });
    if (value !== current) {
      this.notifications.later(async () => ({
        kind: 'commission_changed',
        userIds: await this.independentDrivers(),
        app: 'transport',
        email: true,
        text: (m, locale) =>
          m.commissionChanged(
            Number(value).toLocaleString(locale, { maximumFractionDigits: 2 }),
            longDate(toNetworkIso(from.toISOString()), locale),
          ),
      }));
    }
    return this.commission(now);
  }

  // --- Debt ---------------------------------------------------------------------------------

  /** Owing more than `DRIVER_DEBT_LIMIT` in any currency to a line the platform runs. */
  async debtExceeded(userId: string): Promise<boolean> {
    const balances = await this.settlements.driverBalances([], this.database.db, userId);
    const lines = await this.platformLines([...balances.keys()]);
    return [...balances.entries()].some(
      ([organizationId, list]) =>
        lines.has(organizationId) &&
        list.some((b) => toScaled(b.balance, 2) < -toScaled(DRIVER_DEBT_LIMIT[b.currency], 2)),
    );
  }

  // --- Weekly payouts -----------------------------------------------------------------------

  /**
   * Creates this week's payout for every independent driver owed at least
   * `DRIVER_PAYOUT_MINIMUM` who registered where to be paid. Once per driver, line, currency and
   * week (a unique index), even if it runs again or on several instances.
   */
  async run(now = new Date()): Promise<DriverPayoutRun> {
    const week = isoWeek(now);
    const lines = await this.database.db
      .select({ id: organizations.id })
      .from(organizations)
      .where(eq(organizations.operatedByPlatform, true));
    const created: (typeof payouts.$inferSelect)[] = [];
    for (const line of lines) {
      await this.database.db.transaction(async (tx) => {
        // The same lock as a manual payout: both never spend the same balance.
        await tx
          .select({ id: organizations.id })
          .from(organizations)
          .where(eq(organizations.id, line.id))
          .for('update');
        const balances = (await this.settlements.driverBalances([line.id], tx)).get(line.id) ?? [];
        for (const b of balances) {
          if (!b.driver || !b.payoutAccount) continue;
          if (toScaled(b.balance, 2) < toScaled(DRIVER_PAYOUT_MINIMUM[b.currency], 2)) continue;
          const [row] = await tx
            .insert(payouts)
            .values({
              organizationId: line.id,
              driverUserId: b.driver.id,
              direction: 'to_operator',
              currency: b.currency,
              amount: b.balance,
              method: b.payoutAccount.method,
              reference: '',
              note: `Pago semanal automático ${week}`,
              status: 'pending',
              runWeek: week,
            })
            .onConflictDoNothing()
            .returning();
          if (row) created.push(row);
        }
      });
    }
    let sent = 0;
    if (this.config.get('PAYOUT_PROVIDER') === 'simulated') {
      for (const row of created) {
        await this.send(row.id, `SIM-${randomBytes(4).toString('hex').toUpperCase()}`);
        sent += 1;
      }
    }
    if (created.length) {
      this.logger.log(`Driver payouts ${week}: ${created.length} created, ${sent} sent`);
    }
    return { week, created: created.length, sent };
  }

  /** Automatic payouts waiting for finance to transfer them, oldest first. */
  async pending(): Promise<PendingDriverPayout[]> {
    const rows = await this.database.db
      .select({
        payout: payouts,
        driverName: sql<string>`trim(coalesce(${users.firstName}, '') || ' ' || coalesce(${users.lastName}, ''))`,
        line: sql<string>`coalesce(${organizations.tradeName}, ${organizations.legalName})`,
        account: driverPayoutAccounts,
      })
      .from(payouts)
      .innerJoin(organizations, eq(organizations.id, payouts.organizationId))
      .leftJoin(users, eq(users.id, payouts.driverUserId))
      .leftJoin(driverPayoutAccounts, eq(driverPayoutAccounts.userId, payouts.driverUserId))
      .where(and(eq(payouts.status, 'pending'), sql`${payouts.voidedAt} is null`))
      .orderBy(payouts.createdAt)
      .limit(200);
    return rows.map(({ payout, driverName, line, account }) => ({
      ...toPayout(payout, driverName),
      line,
      account: account
        ? {
            method: account.method,
            bank: account.bank,
            account: account.account,
            holderId: account.holderId,
            holderName: account.holderName,
          }
        : null,
    }));
  }

  /** Finance transferred it: the reference is recorded and the driver is told. */
  async markSent(
    auth: Authenticated,
    payoutId: string,
    reference: string,
    meta: RequestMeta,
  ): Promise<Payout> {
    const clean = reference.trim();
    if (!clean) throw invalid('Type the reference of the transfer');
    const row = await this.send(payoutId, clean);
    await this.audit.record({
      action: 'settlement.payout_sent',
      actorUserId: auth.user.id,
      targetType: 'payout',
      targetId: payoutId,
      ip: meta.ip,
    });
    return toPayout(row);
  }

  private async send(payoutId: string, reference: string) {
    const [row] = await this.database.db
      .update(payouts)
      .set({ status: 'sent', reference, sentAt: new Date() })
      .where(
        and(
          eq(payouts.id, payoutId),
          eq(payouts.status, 'pending'),
          sql`${payouts.voidedAt} is null`,
        ),
      )
      .returning();
    if (!row) throw conflict('That payout is not pending', 'PAYOUT_NOT_PENDING');
    if (row.driverUserId) {
      this.notifications.send({
        kind: 'payout_sent',
        userIds: [row.driverUserId],
        app: 'transport',
        email: true,
        text: (m, locale) => m.payoutSent(formatMoney(row.amount, row.currency, locale), reference),
      });
    }
    return row;
  }

  private async platformLines(ids: string[]): Promise<Set<string>> {
    if (!ids.length) return new Set();
    const rows = await this.database.db
      .select({ id: organizations.id })
      .from(organizations)
      .where(and(inArray(organizations.id, ids), eq(organizations.operatedByPlatform, true)));
    return new Set(rows.map((r) => r.id));
  }

  private async independentDrivers(): Promise<string[]> {
    const rows = await this.database.db
      .selectDistinct({ userId: memberships.userId })
      .from(memberships)
      .innerJoin(organizations, eq(organizations.id, memberships.organizationId))
      .where(and(eq(organizations.operatedByPlatform, true), eq(memberships.role, 'driver')));
    return rows.map((r) => r.userId);
  }
}
