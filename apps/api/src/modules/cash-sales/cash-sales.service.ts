import { HttpStatus, Injectable } from '@nestjs/common';
import {
  addAmounts,
  todayInVenezuela,
  type CashSale,
  type CashSalesDay,
  type CashTotal,
  type CreateCashSaleRequest,
} from '@vtp/shared-types';
import { and, asc, eq, inArray, isNull } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { ApiException } from '../../common/errors/api.exception.js';
import { DatabaseService } from '../../database/database.service.js';
import { AuditService } from '../audit/audit.service.js';
import { users } from '../identity/identity.schema.js';
import type { Authenticated, RequestMeta } from '../identity/sessions.service.js';
import { routeFares, routes, routeStops, stops } from '../network/network.schema.js';
import type { OrganizationAccess } from '../organizations/organization-access.js';
import { fromScaled, toScaled } from '../payments/money.js';
import { cashSales, type CashSaleRow } from './cash-sales.schema.js';

const invalid = (message: string) =>
  new ApiException('VALIDATION_FAILED', message, HttpStatus.BAD_REQUEST);
const notFound = () => new ApiException('NOT_FOUND', 'Cash sale not found', HttpStatus.NOT_FOUND);

/**
 * Cash sales (ADR-033): passengers who paid the driver in cash on one of the organization's routes.
 * The amount comes from the published fare, so a driver cannot type a wrong one; reports count
 * them apart from app sales (no service fee, nothing to settle).
 */
@Injectable()
export class CashSalesService {
  constructor(
    private readonly database: DatabaseService,
    private readonly audit: AuditService,
  ) {}

  async create(
    access: OrganizationAccess,
    input: CreateCashSaleRequest,
    actor: Authenticated,
    meta: RequestMeta,
  ): Promise<CashSale> {
    const organizationId = access.organization.id;
    const [route] = await this.database.db
      .select({ id: routes.id, status: routes.status })
      .from(routes)
      .where(and(eq(routes.id, input.routeId), eq(routes.organizationId, organizationId)));
    if (!route) throw new ApiException('NOT_FOUND', 'Route not found', HttpStatus.NOT_FOUND);
    if (route.status !== 'active') throw invalid('The route is not published');
    const onRoute = await this.database.db
      .select({ stopId: routeStops.stopId, sequence: routeStops.sequence })
      .from(routeStops)
      .where(
        and(
          eq(routeStops.routeId, route.id),
          inArray(routeStops.stopId, [input.fromStopId, input.toStopId]),
        ),
      );
    const boarding = onRoute.find((s) => s.stopId === input.fromStopId);
    const alighting = onRoute.find((s) => s.stopId === input.toStopId);
    if (!boarding || !alighting || boarding.sequence >= alighting.sequence) {
      throw invalid('Choose two stops of the route, in the direction of travel');
    }
    const [fare] = await this.database.db
      .select({ amount: routeFares.amount, currency: routeFares.currency })
      .from(routeFares)
      .where(
        and(
          eq(routeFares.routeId, route.id),
          eq(routeFares.fromStopId, input.fromStopId),
          eq(routeFares.toStopId, input.toStopId),
        ),
      );
    if (!fare) throw invalid('This segment has no published fare');
    const [row] = await this.database.db
      .insert(cashSales)
      .values({
        organizationId,
        routeId: route.id,
        fromStopId: input.fromStopId,
        toStopId: input.toStopId,
        passengers: input.passengers,
        amount: fromScaled(toScaled(fare.amount, 2) * BigInt(input.passengers), 2),
        currency: fare.currency,
        serviceDate: todayInVenezuela(),
        driverUserId: actor.user.id,
      })
      .returning();
    await this.record('cash_sale.recorded', row!.id, actor, meta, {
      organizationId,
      passengers: row!.passengers,
      amount: row!.amount,
      currency: row!.currency,
    });
    return (await this.view([row!]))[0]!;
  }

  /** What this driver recorded on `date` (today by default) for the organization. */
  async mine(
    access: OrganizationAccess,
    actor: Authenticated,
    date = todayInVenezuela(),
  ): Promise<CashSalesDay> {
    const rows = await this.database.db
      .select()
      .from(cashSales)
      .where(
        and(
          eq(cashSales.organizationId, access.organization.id),
          eq(cashSales.driverUserId, actor.user.id),
          eq(cashSales.serviceDate, date),
        ),
      )
      .orderBy(asc(cashSales.createdAt));
    const sales = await this.view(rows);
    return { date, sales, totals: totals(sales.filter((s) => !s.voidedAt)) };
  }

  /** A mistaken record, by whoever recorded it and the same day only. */
  async void(
    access: OrganizationAccess,
    saleId: string,
    reason: string,
    actor: Authenticated,
    meta: RequestMeta,
  ): Promise<CashSale> {
    const [row] = await this.database.db
      .update(cashSales)
      .set({ voidedAt: new Date(), voidReason: reason.trim() })
      .where(
        and(
          eq(cashSales.id, saleId),
          eq(cashSales.organizationId, access.organization.id),
          eq(cashSales.driverUserId, actor.user.id),
          eq(cashSales.serviceDate, todayInVenezuela()),
          isNull(cashSales.voidedAt),
        ),
      )
      .returning();
    if (!row) throw notFound();
    await this.record('cash_sale.voided', row.id, actor, meta, {
      organizationId: access.organization.id,
    });
    return (await this.view([row]))[0]!;
  }

  private async view(rows: CashSaleRow[]): Promise<CashSale[]> {
    if (!rows.length) return [];
    const from = alias(stops, 'from_stop');
    const to = alias(stops, 'to_stop');
    const details = await this.database.db
      .select({
        id: cashSales.id,
        route: { id: routes.id, name: routes.name },
        from: { id: from.id, name: from.name },
        to: { id: to.id, name: to.name },
        driver: { id: users.id, firstName: users.firstName, lastName: users.lastName },
      })
      .from(cashSales)
      .innerJoin(routes, eq(routes.id, cashSales.routeId))
      .innerJoin(from, eq(from.id, cashSales.fromStopId))
      .innerJoin(to, eq(to.id, cashSales.toStopId))
      .innerJoin(users, eq(users.id, cashSales.driverUserId))
      .where(
        inArray(
          cashSales.id,
          rows.map((r) => r.id),
        ),
      );
    const byId = new Map(details.map((d) => [d.id, d]));
    return rows.map((row) => {
      const d = byId.get(row.id)!;
      return {
        id: row.id,
        route: d.route,
        from: d.from,
        to: d.to,
        passengers: row.passengers,
        amount: row.amount,
        currency: row.currency,
        serviceDate: row.serviceDate,
        recordedAt: row.createdAt.toISOString(),
        driver: {
          id: d.driver.id,
          name: [d.driver.firstName, d.driver.lastName].filter(Boolean).join(' ') || '—',
        },
        voidedAt: row.voidedAt?.toISOString() ?? null,
        voidReason: row.voidReason,
      };
    });
  }

  private record(
    action: string,
    targetId: string,
    actor: Authenticated,
    meta: RequestMeta,
    metadata: Record<string, unknown>,
  ) {
    return this.audit.record({
      action,
      actorUserId: actor.user.id,
      targetType: 'cash_sale',
      targetId,
      ip: meta.ip,
      metadata,
    });
  }
}

/** Passengers and amount per currency, USD first. */
export function totals(sales: Pick<CashSale, 'currency' | 'passengers' | 'amount'>[]): CashTotal[] {
  const byCurrency = new Map<CashTotal['currency'], CashTotal>();
  for (const sale of sales) {
    const current = byCurrency.get(sale.currency) ?? {
      currency: sale.currency,
      passengers: 0,
      amount: '0.00',
    };
    byCurrency.set(sale.currency, {
      currency: sale.currency,
      passengers: current.passengers + sale.passengers,
      amount: addAmounts(current.amount, sale.amount),
    });
  }
  return [...byCurrency.values()].sort((a, b) =>
    a.currency === 'USD' ? -1 : b.currency === 'USD' ? 1 : a.currency.localeCompare(b.currency),
  );
}
