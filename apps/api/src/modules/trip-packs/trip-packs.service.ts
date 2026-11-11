import { randomInt } from 'node:crypto';
import { HttpStatus, Injectable } from '@nestjs/common';
import {
  DEFAULT_TRIP_PACK_VALIDITY_DAYS,
  TRIP_PACK_LIMITS,
  unitPriceOf,
  type StopSummary,
  type TripPack,
  type TripPackProduct,
  type TripPackProductInput,
} from '@vtp/shared-types';
import { and, asc, desc, eq, gt, gte, inArray, lt, sql } from 'drizzle-orm';
import { ApiException } from '../../common/errors/api.exception.js';
import {
  DatabaseService,
  type Database,
  type Transaction,
} from '../../database/database.service.js';
import { AuditService } from '../audit/audit.service.js';
import type { Authenticated, RequestMeta } from '../identity/sessions.service.js';
import { serviceAreas } from '../network/network.schema.js';
import { ServicesService } from '../network/services.service.js';
import { StopsService } from '../network/stops.service.js';
import { currentPayment, toPayment } from '../payments/payment-view.js';
import { payments } from '../payments/payments.schema.js';
import {
  tripPackProducts,
  tripPacks,
  type TripPackProductRow,
  type TripPackRow,
} from './trip-packs.schema.js';

const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;

const invalid = (message: string) =>
  new ApiException('VALIDATION_FAILED', message, HttpStatus.BAD_REQUEST);
const notFound = (message: string) => new ApiException('NOT_FOUND', message, HttpStatus.NOT_FOUND);

/**
 * Trip packs (ADR-028): the platform's catalog, and the packs passengers buy. Paying them goes
 * through `PaymentsService`, which calls `activate` when the money arrives.
 */
@Injectable()
export class TripPacksService {
  constructor(
    private readonly database: DatabaseService,
    private readonly audit: AuditService,
    private readonly services: ServicesService,
    private readonly stops: StopsService,
  ) {}

  // --- Catalog -----------------------------------------------------------------------------

  /** Products on sale in the active corridors (public). */
  async onSale(serviceAreaId?: string): Promise<TripPackProduct[]> {
    const open = new Set((await this.services.status()).suburban.areas.map((a) => a.id));
    const products = await this.products(true);
    return products.filter(
      (p) => open.has(p.serviceArea.id) && (!serviceAreaId || p.serviceArea.id === serviceAreaId),
    );
  }

  /** Every product (platform admins). */
  catalog(): Promise<TripPackProduct[]> {
    return this.products(false);
  }

  async createProduct(
    input: TripPackProductInput,
    auth: Authenticated,
    meta: RequestMeta,
  ): Promise<TripPackProduct> {
    const values = await this.productValues(input);
    const [row] = await this.database.db
      .insert(tripPackProducts)
      .values({ ...values, updatedByUserId: auth.user.id })
      .returning();
    await this.recordProduct('trip_pack_product.created', row!, auth, meta);
    return this.product(row!.id);
  }

  /** Changes apply to future purchases only: bought packs keep their own terms. */
  async updateProduct(
    productId: string,
    input: Partial<TripPackProductInput>,
    auth: Authenticated,
    meta: RequestMeta,
  ): Promise<TripPackProduct> {
    const [current] = await this.database.db
      .select()
      .from(tripPackProducts)
      .where(eq(tripPackProducts.id, productId));
    if (!current) throw notFound('Product not found');
    const values = await this.productValues({
      serviceAreaId: input.serviceAreaId ?? current.serviceAreaId,
      stopIds: input.stopIds ?? [current.stopAId, current.stopBId],
      mode: input.mode ?? current.mode,
      trips: input.trips ?? current.trips,
      price: input.price ?? current.price,
      currency: input.currency ?? current.currency,
      validityDays: input.validityDays ?? current.validityDays,
      active: input.active ?? current.active,
    });
    await this.database.db
      .update(tripPackProducts)
      .set({ ...values, updatedByUserId: auth.user.id, updatedAt: new Date() })
      .where(eq(tripPackProducts.id, productId));
    await this.recordProduct('trip_pack_product.updated', current, auth, meta, {
      changed: Object.keys(input),
    });
    return this.product(productId);
  }

  // --- Packs ---------------------------------------------------------------------------------

  /** Buys a pack: it waits `TRIP_PACK_LIMITS.paymentHours` for its payment. */
  async buy(auth: Authenticated, productId: string, meta: RequestMeta): Promise<TripPack> {
    const [product] = (await this.onSale()).filter((p) => p.id === productId);
    if (!product) {
      throw ApiException.conflict('This trip pack is not for sale', 'TRIP_PACK_NOT_FOR_SALE');
    }
    let row: TripPackRow | undefined;
    for (let attempt = 0; !row && attempt < 3; attempt++) {
      [row] = await this.database.db
        .insert(tripPacks)
        .values({
          code: `PAQ-${randomCode(6)}`,
          userId: auth.user.id,
          productId: product.id,
          serviceAreaId: product.serviceArea.id,
          stopAId: product.stops[0].id,
          stopBId: product.stops[1].id,
          mode: product.mode,
          trips: product.trips,
          remaining: product.trips,
          price: product.price,
          currency: product.currency,
          unitPrice: product.unitPrice,
          validityDays: product.validityDays,
          paymentDueAt: new Date(Date.now() + TRIP_PACK_LIMITS.paymentHours * HOUR_MS),
        })
        .onConflictDoNothing({ target: tripPacks.code })
        .returning();
    }
    if (!row) throw new Error('Could not generate a unique trip pack code');
    await this.audit.record({
      action: 'trip_pack.bought',
      actorUserId: auth.user.id,
      targetType: 'trip_pack',
      targetId: row.id,
      ip: meta.ip,
      metadata: { productId: product.id, price: product.price, currency: product.currency },
    });
    return this.getMine(auth.user.id, row.id);
  }

  async listMine(userId: string): Promise<TripPack[]> {
    await this.sweep();
    const rows = await this.database.db
      .select()
      .from(tripPacks)
      .where(eq(tripPacks.userId, userId))
      .orderBy(desc(tripPacks.createdAt));
    return this.toPacks(rows);
  }

  async getMine(userId: string, packId: string): Promise<TripPack> {
    await this.sweep();
    const [row] = await this.database.db
      .select()
      .from(tripPacks)
      .where(and(eq(tripPacks.id, packId), eq(tripPacks.userId, userId)));
    if (!row) throw notFound('Trip pack not found');
    return (await this.toPacks([row]))[0]!;
  }

  /** A pack waiting for its payment, locked; null when it is not (or no longer) waiting. */
  async lockPending(tx: Transaction, packId: string): Promise<TripPackRow | null> {
    const [row] = await tx.select().from(tripPacks).where(eq(tripPacks.id, packId)).for('update');
    if (!row || row.status !== 'pending_payment') return null;
    if (row.paymentDueAt && row.paymentDueAt.getTime() < Date.now()) {
      // A reported payment keeps it waiting (staff may still find the money).
      const [reported] = await tx
        .select({ id: payments.id })
        .from(payments)
        .where(and(eq(payments.tripPackId, packId), eq(payments.status, 'reported')));
      if (!reported) return null;
    }
    return row;
  }

  /**
   * The money arrived: the pack becomes usable for `validityDays` from now. False when it can no
   * longer be activated (the payment is then refunded). Runs in the payment's transaction.
   */
  async activate(tx: Transaction, packId: string): Promise<TripPackRow | null> {
    if (!(await this.lockPending(tx, packId))) return null;
    const [row] = await tx
      .update(tripPacks)
      .set({
        status: 'active',
        activatedAt: new Date(),
        expiresAt: daysFromNow(await this.validityOf(tx, packId)),
        paymentDueAt: null,
        updatedAt: new Date(),
      })
      .where(and(eq(tripPacks.id, packId), eq(tripPacks.status, 'pending_payment')))
      .returning();
    return row ?? null;
  }

  /**
   * Spends `seats` trips of one of the user's active packs for a departure leaving at
   * `departsAt`, atomically (two bookings never spend the same trip). Null when the pack has not
   * enough trips left, is not active or expires before the departure.
   */
  async spend(
    tx: Transaction,
    userId: string,
    packId: string,
    seats: number,
    departsAt: Date,
  ): Promise<TripPackRow | null> {
    const [row] = await tx
      .update(tripPacks)
      .set({
        remaining: sql`${tripPacks.remaining} - ${seats}`,
        status: sql`case when ${tripPacks.remaining} - ${seats} = 0 then 'exhausted'::trip_pack_status else 'active'::trip_pack_status end`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(tripPacks.id, packId),
          eq(tripPacks.userId, userId),
          eq(tripPacks.status, 'active'),
          gte(tripPacks.remaining, seats),
          gt(tripPacks.expiresAt, departsAt),
        ),
      )
      .returning();
    return row ?? null;
  }

  /**
   * Gives `seats` trips back (a booking cancelled in time, or a departure the operator
   * cancelled). Lost if the pack already expired. True when they went back.
   */
  async giveBack(tx: Transaction, packId: string, seats: number): Promise<boolean> {
    const [row] = await tx
      .update(tripPacks)
      .set({
        remaining: sql`least(${tripPacks.trips}, ${tripPacks.remaining} + ${seats})`,
        status: 'active',
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(tripPacks.id, packId),
          inArray(tripPacks.status, ['active', 'exhausted']),
          gt(tripPacks.expiresAt, new Date()),
        ),
      )
      .returning({ id: tripPacks.id });
    return Boolean(row);
  }

  /** Gives a pack whose payment was rejected a fresh time to pay. */
  async extendPayment(tx: Transaction, packId: string): Promise<void> {
    await tx
      .update(tripPacks)
      .set({ paymentDueAt: new Date(Date.now() + TRIP_PACK_LIMITS.paymentHours * HOUR_MS) })
      .where(and(eq(tripPacks.id, packId), eq(tripPacks.status, 'pending_payment')));
  }

  async row(db: Database | Transaction, packId: string): Promise<TripPackRow | undefined> {
    const [row] = await db.select().from(tripPacks).where(eq(tripPacks.id, packId));
    return row;
  }

  /** `"San Félix ↔ Puerto Ordaz"`, for notices and staff queues. */
  async stretch(pack: Pick<TripPackRow, 'stopAId' | 'stopBId'>): Promise<string> {
    const stops = await this.stops.summaries([pack.stopAId, pack.stopBId]);
    return `${stops.get(pack.stopAId)?.city ?? '?'} ↔ ${stops.get(pack.stopBId)?.city ?? '?'}`;
  }

  /**
   * Lazy status changes, like expired holds: unpaid packs past their payment time are cancelled
   * and paid ones past their expiry expire (their unused trips are lost).
   */
  async sweep(): Promise<void> {
    const now = new Date();
    await this.database.db
      .update(tripPacks)
      .set({ status: 'expired', updatedAt: now })
      .where(and(eq(tripPacks.status, 'active'), lt(tripPacks.expiresAt, now)));
    const overdue = await this.database.db
      .select({ id: tripPacks.id })
      .from(tripPacks)
      .where(and(eq(tripPacks.status, 'pending_payment'), lt(tripPacks.paymentDueAt, now)));
    if (!overdue.length) return;
    const reported = new Set(
      (
        await this.database.db
          .select({ id: payments.tripPackId })
          .from(payments)
          .where(
            and(
              inArray(
                payments.tripPackId,
                overdue.map((o) => o.id),
              ),
              eq(payments.status, 'reported'),
            ),
          )
      ).map((r) => r.id),
    );
    const cancel = overdue.map((o) => o.id).filter((id) => !reported.has(id));
    if (!cancel.length) return;
    await this.database.db
      .update(tripPacks)
      .set({ status: 'cancelled', paymentDueAt: null, updatedAt: now })
      .where(and(inArray(tripPacks.id, cancel), eq(tripPacks.status, 'pending_payment')));
    await this.database.db
      .update(payments)
      .set({ status: 'cancelled' })
      .where(and(inArray(payments.tripPackId, cancel), eq(payments.status, 'pending')));
  }

  private async validityOf(tx: Transaction, packId: string): Promise<number> {
    const [row] = await tx
      .select({ days: tripPacks.validityDays })
      .from(tripPacks)
      .where(eq(tripPacks.id, packId));
    return row?.days ?? DEFAULT_TRIP_PACK_VALIDITY_DAYS;
  }

  private async toPacks(rows: TripPackRow[]): Promise<TripPack[]> {
    if (!rows.length) return [];
    const ids = rows.map((r) => r.id);
    const [stops, areas, paymentRows] = await Promise.all([
      this.stops.summaries([...new Set(rows.flatMap((r) => [r.stopAId, r.stopBId]))]),
      this.database.db
        .select({ id: serviceAreas.id, name: serviceAreas.name })
        .from(serviceAreas)
        .where(inArray(serviceAreas.id, [...new Set(rows.map((r) => r.serviceAreaId))])),
      this.database.db.select().from(payments).where(inArray(payments.tripPackId, ids)),
    ]);
    return rows.map((row) => {
      const payment = currentPayment(
        paymentRows.filter((p) => p.tripPackId === row.id),
        row.status === 'pending_payment',
      );
      return {
        id: row.id,
        code: row.code,
        productId: row.productId,
        serviceArea: areas.find((a) => a.id === row.serviceAreaId) ?? {
          id: row.serviceAreaId,
          name: '',
        },
        stops: [stops.get(row.stopAId)!, stops.get(row.stopBId)!] as [StopSummary, StopSummary],
        mode: row.mode,
        trips: row.trips,
        remaining: row.remaining,
        price: row.price,
        currency: row.currency,
        unitPrice: row.unitPrice,
        validityDays: row.validityDays,
        status: row.status,
        paymentDueAt:
          row.status === 'pending_payment' && row.paymentDueAt
            ? row.paymentDueAt.toISOString()
            : null,
        expiresAt: row.expiresAt?.toISOString() ?? null,
        activatedAt: row.activatedAt?.toISOString() ?? null,
        payment: payment ? toPayment(payment) : null,
        createdAt: row.createdAt.toISOString(),
      };
    });
  }

  private async products(onlyActive: boolean): Promise<TripPackProduct[]> {
    const rows = await this.database.db
      .select({ product: tripPackProducts, area: { id: serviceAreas.id, name: serviceAreas.name } })
      .from(tripPackProducts)
      .innerJoin(serviceAreas, eq(serviceAreas.id, tripPackProducts.serviceAreaId))
      .where(onlyActive ? eq(tripPackProducts.active, true) : undefined)
      .orderBy(asc(serviceAreas.name), asc(tripPackProducts.mode), asc(tripPackProducts.trips));
    const stops = await this.stops.summaries([
      ...new Set(rows.flatMap((r) => [r.product.stopAId, r.product.stopBId])),
    ]);
    return rows.map(({ product, area }) => toProduct(product, area, stops));
  }

  private async product(productId: string): Promise<TripPackProduct> {
    const product = (await this.products(false)).find((p) => p.id === productId);
    if (!product) throw notFound('Product not found');
    return product;
  }

  /** Validated values: both stops in the corridor, sensible trips, price and validity. */
  private async productValues(input: TripPackProductInput) {
    const [a, b] = input.stopIds;
    if (a === b) throw invalid('The two stops of the stretch must be different');
    const inArea = await this.services.areaStopIds(input.serviceAreaId);
    if (!inArea.has(a) || !inArea.has(b)) {
      throw ApiException.conflict(
        'Both stops must belong to the corridor',
        'ROUTE_OUTSIDE_SERVICE_AREA',
      );
    }
    if (!(Number(input.price) > 0)) throw invalid('The price must be greater than zero');
    return {
      serviceAreaId: input.serviceAreaId,
      stopAId: a,
      stopBId: b,
      mode: input.mode,
      trips: input.trips,
      price: Number(input.price).toFixed(2),
      currency: input.currency,
      validityDays: input.validityDays ?? DEFAULT_TRIP_PACK_VALIDITY_DAYS,
      active: input.active ?? true,
    };
  }

  private recordProduct(
    action: string,
    row: TripPackProductRow,
    auth: Authenticated,
    meta: RequestMeta,
    metadata: Record<string, unknown> = {},
  ) {
    return this.audit.record({
      action,
      actorUserId: auth.user.id,
      targetType: 'trip_pack_product',
      targetId: row.id,
      ip: meta.ip,
      metadata,
    });
  }
}

function toProduct(
  row: TripPackProductRow,
  area: { id: string; name: string },
  stops: Map<string, StopSummary>,
): TripPackProduct {
  return {
    id: row.id,
    serviceArea: area,
    stops: [stops.get(row.stopAId)!, stops.get(row.stopBId)!],
    mode: row.mode,
    trips: row.trips,
    price: row.price,
    currency: row.currency,
    unitPrice: unitPriceOf(row.price, row.trips),
    validityDays: row.validityDays,
    active: row.active,
  };
}

const daysFromNow = (days: number) => new Date(Date.now() + days * DAY_MS);

function randomCode(length: number): string {
  let code = '';
  for (let i = 0; i < length; i++) code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return code;
}
