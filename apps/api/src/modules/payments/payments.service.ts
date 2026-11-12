import { randomInt } from 'node:crypto';
import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import {
  PAYMENT_METHOD_CURRENCY,
  PAYMENT_METHODS,
  PLATFORM_RATE_MAX_HOURS,
  PAYMENT_REVIEW_HOLD_HOURS,
  longDate,
  paymentAccountProblem,
  toNetworkIso,
  type Booking,
  type ExchangeRate,
  type Payment,
  type PaymentAccount,
  type PaymentAccountInput,
  type PaymentCurrency,
  type PaymentMethod,
  type PaymentOption,
  type PaymentReview,
  type RateCurrency,
  type ReplaceExchangeRatesRequest,
  type TripPack,
  type Currency,
} from '@vtp/shared-types';
import { and, asc, eq, gt, inArray, isNull, ne } from 'drizzle-orm';
import { ApiException } from '../../common/errors/api.exception.js';
import { AppConfigService } from '../../config/app-config.service.js';
import { DatabaseService } from '../../database/database.service.js';
import { AuditService } from '../audit/audit.service.js';
import { bookings, trips, type BookingRow } from '../bookings/bookings.schema.js';
import { BookingsService } from '../bookings/bookings.service.js';
import { expireHolds } from '../bookings/occupancy.js';
import { users } from '../identity/identity.schema.js';
import type { Authenticated, RequestMeta } from '../identity/sessions.service.js';
import { routes } from '../network/network.schema.js';
import { organizations } from '../organizations/organizations.schema.js';
import type { OrganizationAccess } from '../organizations/organization-access.js';
import { departureText } from '../notifications/format.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { tripPacks } from '../trip-packs/trip-packs.schema.js';
import { TripPacksService } from '../trip-packs/trip-packs.service.js';
import { policyFor, recordEarning } from '../settlements/ledger.js';
import { compareAmounts, convert, toScaled } from './money.js';
import { accountOwner, PAYMENT_PROVIDER, type PaymentProvider } from './payment-provider.js';
import { toPayment } from './payment-view.js';
import {
  exchangeRates,
  paymentAccounts,
  platformExchangeRates,
  payments,
  type PaymentAccountRow,
  type PaymentRow,
} from './payments.schema.js';

const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

const conflict = ApiException.conflict;
const notFound = (message: string) => new ApiException('NOT_FOUND', message, HttpStatus.NOT_FOUND);

const uniqueViolation = (error: unknown): string | undefined => {
  const cause = (error as { cause?: { code?: string; constraint?: string } }).cause ?? error;
  const pg = cause as { code?: string; constraint?: string };
  return pg.code === '23505' ? (pg.constraint ?? 'unique') : undefined;
};

/** Money reported by a provider for one payment reference. */
export interface IncomingPayment {
  provider: string;
  reference: string;
  amount: string;
  currency: PaymentCurrency;
  providerReference: string;
}

@Injectable()
export class PaymentsService {
  constructor(
    private readonly database: DatabaseService,
    private readonly bookings: BookingsService,
    private readonly audit: AuditService,
    private readonly config: AppConfigService,
    private readonly notifications: NotificationsService,
    private readonly packs: TripPacksService,
    @Inject(PAYMENT_PROVIDER) private readonly provider: PaymentProvider | null,
  ) {}

  // --- Exchange rates (operators) ------------------------------------------------------------

  async rates(organizationId: string): Promise<ExchangeRate[]> {
    const rows = await this.database.db
      .select()
      .from(exchangeRates)
      .where(eq(exchangeRates.organizationId, organizationId))
      .orderBy(exchangeRates.currency);
    return rows.map((r) => ({
      currency: r.currency,
      unitsPerUsd: r.unitsPerUsd,
      updatedAt: r.updatedAt.toISOString(),
    }));
  }

  async replaceRates(
    access: OrganizationAccess,
    input: ReplaceExchangeRatesRequest,
    auth: Authenticated,
    meta: RequestMeta,
  ): Promise<ExchangeRate[]> {
    assertRates(input);
    const organizationId = access.organization.id;
    await this.database.db.transaction(async (tx) => {
      await tx.delete(exchangeRates).where(eq(exchangeRates.organizationId, organizationId));
      if (input.rates.length) {
        await tx.insert(exchangeRates).values(
          input.rates.map((r) => ({
            organizationId,
            currency: r.currency,
            unitsPerUsd: r.unitsPerUsd,
            updatedByUserId: auth.user.id,
          })),
        );
      }
    });
    await this.audit.record({
      action: 'exchange_rates.replaced',
      actorUserId: auth.user.id,
      targetType: 'organization',
      targetId: organizationId,
      ip: meta.ip,
      metadata: Object.fromEntries(input.rates.map((r) => [r.currency, r.unitsPerUsd])),
    });
    return this.rates(organizationId);
  }

  /** The platform's own rates, for what it sells (trip packs). */
  async platformRates(): Promise<ExchangeRate[]> {
    const rows = await this.database.db
      .select()
      .from(platformExchangeRates)
      .orderBy(platformExchangeRates.currency);
    return rows.map((r) => ({
      currency: r.currency,
      unitsPerUsd: r.unitsPerUsd,
      updatedAt: r.updatedAt.toISOString(),
    }));
  }

  async replacePlatformRates(
    input: ReplaceExchangeRatesRequest,
    auth: Authenticated,
    meta: RequestMeta,
  ): Promise<ExchangeRate[]> {
    assertRates(input);
    await this.database.db.transaction(async (tx) => {
      await tx.delete(platformExchangeRates);
      if (input.rates.length) {
        await tx.insert(platformExchangeRates).values(
          input.rates.map((r) => ({
            currency: r.currency,
            unitsPerUsd: r.unitsPerUsd,
            updatedByUserId: auth.user.id,
          })),
        );
      }
    });
    await this.audit.record({
      action: 'platform_exchange_rates.replaced',
      actorUserId: auth.user.id,
      ip: meta.ip,
      metadata: Object.fromEntries(input.rates.map((r) => [r.currency, r.unitsPerUsd])),
    });
    return this.platformRates();
  }

  // --- Paying a booking (passengers) ---------------------------------------------------------

  /** Methods the passenger can use now for a held booking, with converted amounts. */
  async options(auth: Authenticated, bookingId: string): Promise<PaymentOption[]> {
    const { booking, organizationId } = await this.requireHeld(auth.user.id, bookingId);
    return this.optionsFor(booking, organizationId, await this.collectorFor(organizationId));
  }

  /** Starts paying with one method; a pending payment with another method is replaced. */
  async create(
    auth: Authenticated,
    bookingId: string,
    method: PaymentMethod,
    meta: RequestMeta,
  ): Promise<Payment> {
    const { booking, organizationId } = await this.requireHeld(auth.user.id, bookingId);
    const collector = await this.collectorFor(organizationId);
    const option = (await this.optionsFor(booking, organizationId, collector)).find(
      (o) => o.method === method,
    );
    const unavailable = () =>
      conflict(
        'This payment method is not available for this booking',
        'PAYMENT_METHOD_UNAVAILABLE',
      );
    const provider = this.provider;
    if (!option || !provider) throw unavailable();

    let payment: PaymentRow | undefined;
    for (let attempt = 0; !payment && attempt < 3; attempt++) {
      const reference = `${booking.code}-${randomCode(2)}`;
      const instructions = await provider.instructions({
        method,
        amount: option.amount,
        currency: option.currency,
        reference,
        collector,
      });
      if (!instructions) throw unavailable();
      try {
        payment = await this.database.db.transaction(async (tx) => {
          // Lock the booking so two requests cannot both leave a pending payment.
          const [locked] = await tx
            .select({ status: bookings.status })
            .from(bookings)
            .where(eq(bookings.id, booking.id))
            .for('update');
          if (locked?.status !== 'held')
            throw conflict(
              'This booking is no longer waiting for payment',
              'BOOKING_NOT_AWAITING_PAYMENT',
            );
          const [underReview] = await tx
            .select({ id: payments.id })
            .from(payments)
            .where(and(eq(payments.bookingId, booking.id), eq(payments.status, 'reported')));
          if (underReview)
            throw conflict('A reported payment is being verified', 'PAYMENT_UNDER_REVIEW');
          await tx
            .update(payments)
            .set({ status: 'cancelled' })
            .where(and(eq(payments.bookingId, booking.id), eq(payments.status, 'pending')));
          const [row] = await tx
            .insert(payments)
            .values({
              bookingId: booking.id,
              userId: auth.user.id,
              method,
              amount: option.amount,
              currency: option.currency,
              rate: option.rate,
              reference,
              collectorOrganizationId: collector,
              provider: provider.name,
              instructions,
              expiresAt: booking.expiresAt,
            })
            .returning();
          return row!;
        });
      } catch (error) {
        if (uniqueViolation(error) !== 'payments_reference_key') throw error;
      }
    }
    if (!payment) throw new Error('Could not generate a unique payment reference');
    await this.audit.record({
      action: 'payment.created',
      actorUserId: auth.user.id,
      targetType: 'payment',
      targetId: payment.id,
      ip: meta.ip,
      metadata: {
        bookingId: booking.id,
        method,
        amount: payment.amount,
        currency: payment.currency,
      },
    });
    return toPayment(payment);
  }

  // --- Paying a trip pack (passengers) -----------------------------------------------------

  /** Methods the passenger can use now for a pack waiting for its payment. */
  async packOptions(auth: Authenticated, packId: string): Promise<PaymentOption[]> {
    const pack = await this.requirePendingPack(auth.user.id, packId);
    return this.packOptionsFor(pack);
  }

  /** Starts paying a pack with one method; always into the platform's accounts (ADR-028). */
  async createForPack(
    auth: Authenticated,
    packId: string,
    method: PaymentMethod,
    meta: RequestMeta,
  ): Promise<Payment> {
    const pack = await this.requirePendingPack(auth.user.id, packId);
    const option = (await this.packOptionsFor(pack)).find((o) => o.method === method);
    const provider = this.provider;
    const unavailable = () =>
      conflict(
        'This payment method is not available for this trip pack',
        'PAYMENT_METHOD_UNAVAILABLE',
      );
    if (!option || !provider) throw unavailable();
    let payment: PaymentRow | undefined;
    for (let attempt = 0; !payment && attempt < 3; attempt++) {
      const reference = `${pack.code}-${randomCode(2)}`;
      const instructions = await provider.instructions({
        method,
        amount: option.amount,
        currency: option.currency,
        reference,
        collector: null,
      });
      if (!instructions) throw unavailable();
      try {
        payment = await this.database.db.transaction(async (tx) => {
          const locked = await this.packs.lockPending(tx, pack.id);
          if (!locked) {
            throw conflict(
              'This trip pack is no longer waiting for payment',
              'TRIP_PACK_NOT_AWAITING_PAYMENT',
            );
          }
          const [underReview] = await tx
            .select({ id: payments.id })
            .from(payments)
            .where(and(eq(payments.tripPackId, pack.id), eq(payments.status, 'reported')));
          if (underReview)
            throw conflict('A reported payment is being verified', 'PAYMENT_UNDER_REVIEW');
          await tx
            .update(payments)
            .set({ status: 'cancelled' })
            .where(and(eq(payments.tripPackId, pack.id), eq(payments.status, 'pending')));
          const [row] = await tx
            .insert(payments)
            .values({
              tripPackId: pack.id,
              userId: auth.user.id,
              method,
              amount: option.amount,
              currency: option.currency,
              rate: option.rate,
              reference,
              collectorOrganizationId: null,
              provider: provider.name,
              instructions,
              expiresAt: locked.paymentDueAt,
            })
            .returning();
          return row!;
        });
      } catch (error) {
        if (uniqueViolation(error) !== 'payments_reference_key') throw error;
      }
    }
    if (!payment) throw new Error('Could not generate a unique payment reference');
    await this.audit.record({
      action: 'payment.created',
      actorUserId: auth.user.id,
      targetType: 'payment',
      targetId: payment.id,
      ip: meta.ip,
      metadata: {
        tripPackId: pack.id,
        method,
        amount: payment.amount,
        currency: payment.currency,
      },
    });
    return toPayment(payment);
  }

  /** What a payment pays, as the passenger sees it after acting on the payment. */
  private paid(userId: string, payment: PaymentRow): Promise<Booking | TripPack> {
    return payment.tripPackId
      ? this.packs.getMine(userId, payment.tripPackId)
      : this.bookings.getMine(userId, payment.bookingId!);
  }

  private async requirePendingPack(userId: string, packId: string) {
    const pack = await this.packs.getMine(userId, packId);
    if (pack.status !== 'pending_payment') {
      throw conflict(
        'This trip pack is no longer waiting for payment',
        'TRIP_PACK_NOT_AWAITING_PAYMENT',
      );
    }
    return pack;
  }

  /** Development only: the simulated provider reports the money as received. */
  async simulate(
    auth: Authenticated,
    paymentId: string,
    amount: string | undefined,
  ): Promise<Booking | TripPack> {
    const [payment] = await this.database.db
      .select()
      .from(payments)
      .where(and(eq(payments.id, paymentId), eq(payments.userId, auth.user.id)));
    if (!payment || payment.provider !== 'simulated') throw notFound('Payment not found');
    await this.receive({
      provider: 'simulated',
      reference: payment.reference,
      amount: amount ?? payment.amount,
      currency: payment.currency,
      providerReference: `SIM-${randomCode(10)}`,
    });
    return this.paid(auth.user.id, payment);
  }

  /**
   * Called by a provider adapter when money arrives. Confirms the booking while it is still held
   * (even a few seconds after its hold ran out, as long as nobody took the seats); otherwise, or
   * when the amount or currency is wrong, the payment is marked for refund. Idempotent.
   */
  async receive(incoming: IncomingPayment): Promise<PaymentRow> {
    const result = await this.database.db.transaction(async (tx) => {
      const [payment] = await tx
        .select()
        .from(payments)
        .where(
          and(eq(payments.provider, incoming.provider), eq(payments.reference, incoming.reference)),
        )
        .for('update');
      if (!payment) throw notFound('No payment with this reference');
      const open = payment.status === 'pending' || payment.status === 'reported';
      if (!open && payment.status !== 'cancelled') {
        return { payment, outcome: 'duplicate' as const };
      }
      const received = {
        providerReference: incoming.providerReference,
        receivedAmount: incoming.amount,
      };
      const enough =
        incoming.currency === payment.currency &&
        compareAmounts(incoming.amount, payment.amount) >= 0;
      if (open && enough) {
        // A trip pack becomes usable; a booking is confirmed and earns its operator (packs earn
        // when each trip is used, ADR-028).
        const done = payment.tripPackId
          ? Boolean(await this.packs.activate(tx, payment.tripPackId))
          : await this.bookings.confirmHeld(tx, payment.bookingId!);
        if (done) {
          if (payment.bookingId) {
            await recordEarning(
              tx,
              payment.bookingId,
              payment.collectorOrganizationId ? 'operator' : 'platform',
            );
          }
          const [row] = await tx
            .update(payments)
            .set({ ...received, status: 'confirmed', confirmedAt: new Date() })
            .where(eq(payments.id, payment.id))
            .returning();
          await tx
            .update(payments)
            .set({ status: 'cancelled' })
            .where(
              and(
                sameSubject(payment),
                eq(payments.status, 'pending'),
                ne(payments.id, payment.id),
              ),
            );
          return { payment: row!, outcome: 'confirmed' as const };
        }
      }
      const [row] = await tx
        .update(payments)
        .set({ ...received, status: 'refund_due' })
        .where(eq(payments.id, payment.id))
        .returning();
      return { payment: row!, outcome: 'refund_due' as const };
    });
    if (result.outcome !== 'duplicate') {
      await this.audit.record({
        action: result.outcome === 'confirmed' ? 'payment.confirmed' : 'payment.refund_due',
        targetType: 'payment',
        targetId: result.payment.id,
        metadata: {
          bookingId: result.payment.bookingId,
          tripPackId: result.payment.tripPackId,
          provider: incoming.provider,
          providerReference: incoming.providerReference,
          amount: incoming.amount,
          currency: incoming.currency,
        },
      });
    }
    if (result.outcome === 'confirmed' && result.payment.tripPackId) {
      const packId = result.payment.tripPackId;
      this.notifications.later(async () => {
        const pack = await this.packs.row(this.database.db, packId);
        if (!pack?.expiresAt) return null;
        const stretch = await this.packs.stretch(pack);
        return {
          kind: 'trip_pack_activated',
          userIds: [pack.userId],
          app: 'passenger',
          email: true,
          reference: { key: 'tripPackId', id: packId },
          text: (m, locale) =>
            m.tripPackActivated(
              pack.code,
              pack.trips,
              stretch,
              longDate(toNetworkIso(pack.expiresAt!), locale),
            ),
        };
      });
    }
    if (result.outcome === 'confirmed' && result.payment.bookingId) {
      const bookingId = result.payment.bookingId;
      this.notifications.later(async () => {
        const booking = await this.notifications.booking(bookingId);
        return {
          kind: 'payment_confirmed',
          userIds: [booking.userId],
          app: 'passenger',
          email: true,
          reference: { key: 'bookingId', id: bookingId },
          text: (m, locale) =>
            m.paymentConfirmed(
              booking.code,
              booking.route,
              departureText(booking.departsAt, locale),
            ),
        };
      });
    }
    return result.payment;
  }

  get simulatorEnabled(): boolean {
    return this.config.get('PAYMENT_PROVIDER') === 'simulated';
  }

  // --- Manual payments (ADR-027) -------------------------------------------------------------

  /**
   * "I paid": the payer gives the operation number of a manual payment. The seats stay held
   * while staff verify it. A payment voided because the hold ran out can still be reported: if
   * the money arrived, it is refunded.
   */
  async report(
    auth: Authenticated,
    paymentId: string,
    operationNumber: string,
    meta: RequestMeta,
  ): Promise<Booking | TripPack> {
    await expireHolds(this.database.db);
    await this.packs.sweep();
    await this.voidStale();
    const payment = await this.database.db.transaction(async (tx) => {
      const [row] = await tx
        .select({ payment: payments, booking: bookings, pack: tripPacks })
        .from(payments)
        .leftJoin(bookings, eq(bookings.id, payments.bookingId))
        .leftJoin(tripPacks, eq(tripPacks.id, payments.tripPackId))
        .where(and(eq(payments.id, paymentId), eq(payments.userId, auth.user.id)))
        .for('update', { of: payments });
      if (!row || row.payment.provider !== 'manual') throw notFound('Payment not found');
      // Something no longer waiting for money can still be reported: if it arrived, it is refunded.
      const waiting = row.booking
        ? row.booking.status === 'held'
        : row.pack?.status === 'pending_payment';
      const expired = row.payment.status === 'cancelled' && !waiting;
      if (row.payment.status !== 'pending' && !expired) {
        throw conflict('This payment can no longer be reported', 'PAYMENT_NOT_REPORTABLE');
      }
      if (row.booking?.status === 'held') {
        const review = new Date(
          Math.min(
            Date.now() + PAYMENT_REVIEW_HOLD_HOURS * 3_600_000,
            row.booking.departsAt.getTime(),
          ),
        );
        if (!row.booking.expiresAt || review > row.booking.expiresAt) {
          await tx
            .update(bookings)
            .set({ expiresAt: review })
            .where(eq(bookings.id, row.booking.id));
        }
      }
      const [updated] = await tx
        .update(payments)
        .set({
          status: 'reported',
          payerReference: operationNumber.trim(),
          reportedAt: new Date(),
          expiresAt: null,
        })
        .where(eq(payments.id, paymentId))
        .returning();
      return updated!;
    });
    await this.audit.record({
      action: 'payment.reported',
      actorUserId: auth.user.id,
      targetType: 'payment',
      targetId: payment.id,
      ip: meta.ip,
      metadata: {
        bookingId: payment.bookingId,
        tripPackId: payment.tripPackId,
        operationNumber: payment.payerReference,
      },
    });
    return this.paid(auth.user.id, payment);
  }

  /** Reported payments waiting for whoever collects (an operator id, or null), oldest first. */
  async reviewQueue(collector: string | null): Promise<PaymentReview[]> {
    const rows = await this.database.db
      .select({
        payment: payments,
        booking: bookings,
        pack: tripPacks,
        route: routes.name,
        operator: {
          id: organizations.id,
          legal: organizations.legalName,
          trade: organizations.tradeName,
        },
        payer: {
          firstName: users.firstName,
          lastName: users.lastName,
          email: users.email,
          phone: users.phone,
        },
      })
      .from(payments)
      .leftJoin(bookings, eq(bookings.id, payments.bookingId))
      .leftJoin(trips, eq(trips.id, bookings.tripId))
      .leftJoin(routes, eq(routes.id, trips.routeId))
      .leftJoin(organizations, eq(organizations.id, trips.organizationId))
      .leftJoin(tripPacks, eq(tripPacks.id, payments.tripPackId))
      .innerJoin(users, eq(users.id, payments.userId))
      .where(
        and(
          eq(payments.status, 'reported'),
          eq(payments.provider, 'manual'),
          collectedBy(collector),
        ),
      )
      .orderBy(asc(payments.reportedAt));
    const stretches = new Map(
      await Promise.all(
        rows
          .filter((r) => r.pack)
          .map(async (r) => [r.pack!.id, await this.packs.stretch(r.pack!)] as const),
      ),
    );
    return rows.map((r) => ({
      payment: toPayment(r.payment),
      booking: r.booking
        ? {
            id: r.booking.id,
            code: r.booking.code,
            status: r.booking.status,
            route: r.route ?? '',
            departsAt: toNetworkIso(r.booking.departsAt),
            expiresAt:
              r.booking.status === 'held' && r.booking.expiresAt
                ? r.booking.expiresAt.toISOString()
                : null,
          }
        : null,
      tripPack: r.pack
        ? {
            id: r.pack.id,
            code: r.pack.code,
            description: `${r.pack.trips} viajes · ${stretches.get(r.pack.id) ?? ''}`,
            status: r.pack.status,
          }
        : null,
      operator: r.operator
        ? { id: r.operator.id, name: r.operator.trade ?? r.operator.legal }
        : null,
      payer: {
        name: [r.payer.firstName, r.payer.lastName].filter(Boolean).join(' ') || '—',
        email: r.payer.email,
        phone: r.payer.phone,
      },
    }));
  }

  /**
   * Staff found the money: confirms the booking like an automatic adapter would (or marks the
   * payment for refund when the booking can no longer be confirmed or the amount falls short).
   */
  async confirmReported(
    paymentId: string,
    collector: string | null,
    receivedAmount: string | undefined,
    auth: Authenticated,
    meta: RequestMeta,
  ): Promise<Payment> {
    const payment = await this.requireReported(paymentId, collector);
    await this.database.db
      .update(payments)
      .set({ reviewedByUserId: auth.user.id })
      .where(eq(payments.id, paymentId));
    const result = await this.receive({
      provider: 'manual',
      reference: payment.reference,
      amount: receivedAmount ?? payment.amount,
      currency: payment.currency,
      providerReference: payment.payerReference ?? payment.reference,
    });
    await this.audit.record({
      action: 'payment.verified',
      actorUserId: auth.user.id,
      targetType: 'payment',
      targetId: paymentId,
      ip: meta.ip,
      metadata: { receivedAmount: receivedAmount ?? payment.amount, outcome: result.status },
    });
    return toPayment(result);
  }

  /** Staff did not find the money: the payer is told why and gets a fresh hold to try again. */
  async rejectReported(
    paymentId: string,
    collector: string | null,
    reason: string,
    auth: Authenticated,
    meta: RequestMeta,
  ): Promise<Payment> {
    const rejectionReason = reason.trim();
    const row = await this.database.db.transaction(async (tx) => {
      const [locked] = await tx
        .select()
        .from(payments)
        .where(eq(payments.id, paymentId))
        .for('update');
      if (!locked || locked.provider !== 'manual' || locked.collectorOrganizationId !== collector)
        throw notFound('Payment not found');
      if (locked.status !== 'reported') {
        throw conflict('This payment is not waiting for verification', 'PAYMENT_NOT_REPORTED');
      }
      if (locked.tripPackId) {
        await this.packs.extendPayment(tx, locked.tripPackId);
      } else {
        const minutes = this.config.get('BOOKING_HOLD_MINUTES');
        await tx
          .update(bookings)
          .set({ expiresAt: new Date(Date.now() + minutes * 60_000) })
          .where(and(eq(bookings.id, locked.bookingId!), eq(bookings.status, 'held')));
      }
      const [updated] = await tx
        .update(payments)
        .set({ status: 'rejected', rejectionReason, reviewedByUserId: auth.user.id })
        .where(eq(payments.id, paymentId))
        .returning();
      return updated!;
    });
    await this.audit.record({
      action: 'payment.rejected',
      actorUserId: auth.user.id,
      targetType: 'payment',
      targetId: paymentId,
      ip: meta.ip,
      metadata: { bookingId: row.bookingId, tripPackId: row.tripPackId, reason: rejectionReason },
    });
    if (row.tripPackId) {
      const packId = row.tripPackId;
      this.notifications.later(async () => {
        const pack = await this.packs.row(this.database.db, packId);
        if (!pack) return null;
        return {
          kind: 'payment_rejected',
          userIds: [pack.userId],
          app: 'passenger',
          email: true,
          reference: { key: 'tripPackId', id: packId },
          text: (m) => m.tripPackPaymentRejected(pack.code, rejectionReason),
        };
      });
      return toPayment(row);
    }
    const bookingId = row.bookingId!;
    this.notifications.later(async () => {
      const booking = await this.notifications.booking(bookingId);
      return {
        kind: 'payment_rejected',
        userIds: [booking.userId],
        app: 'passenger',
        email: true,
        reference: { key: 'bookingId', id: bookingId },
        text: (m) => m.paymentRejected(booking.code, rejectionReason),
      };
    });
    return toPayment(row);
  }

  // --- Receiving accounts (the platform's, or an operator's that collects itself) --------------

  async accounts(owner: string | null): Promise<PaymentAccount[]> {
    const rows = await this.database.db.select().from(paymentAccounts).where(accountOwner(owner));
    return rows
      .map(toAccount)
      .sort((a, b) => PAYMENT_METHODS.indexOf(a.method) - PAYMENT_METHODS.indexOf(b.method));
  }

  async setAccount(
    owner: string | null,
    method: PaymentMethod,
    input: PaymentAccountInput,
    auth: Authenticated,
    meta: RequestMeta,
  ): Promise<PaymentAccount> {
    const fields = Object.fromEntries(
      Object.entries(input.fields).map(([k, v]) => [k, String(v).trim()]),
    );
    const problem = paymentAccountProblem(method, fields);
    if (problem) throw new ApiException('VALIDATION_FAILED', problem, HttpStatus.BAD_REQUEST);
    const values = { fields, active: input.active, updatedByUserId: auth.user.id };
    const [existing] = await this.database.db
      .select({ id: paymentAccounts.id })
      .from(paymentAccounts)
      .where(and(accountOwner(owner), eq(paymentAccounts.method, method)));
    const [row] = existing
      ? await this.database.db
          .update(paymentAccounts)
          .set(values)
          .where(eq(paymentAccounts.id, existing.id))
          .returning()
      : await this.database.db
          .insert(paymentAccounts)
          .values({ organizationId: owner, method, ...values })
          .returning();
    await this.audit.record({
      action: 'payment_account.saved',
      actorUserId: auth.user.id,
      targetType: 'payment_account',
      targetId: row!.id,
      ip: meta.ip,
      metadata: { organizationId: owner, method, active: input.active },
    });
    return toAccount(row!);
  }

  async removeAccount(
    owner: string | null,
    method: PaymentMethod,
    auth: Authenticated,
    meta: RequestMeta,
  ): Promise<void> {
    const [row] = await this.database.db
      .delete(paymentAccounts)
      .where(and(accountOwner(owner), eq(paymentAccounts.method, method)))
      .returning({ id: paymentAccounts.id });
    if (!row) throw notFound('No account for this method');
    await this.audit.record({
      action: 'payment_account.removed',
      actorUserId: auth.user.id,
      targetType: 'payment_account',
      targetId: row.id,
      ip: meta.ip,
      metadata: { organizationId: owner, method },
    });
  }

  private async requireReported(paymentId: string, collector: string | null): Promise<PaymentRow> {
    const [payment] = await this.database.db
      .select()
      .from(payments)
      .where(eq(payments.id, paymentId));
    if (!payment || payment.provider !== 'manual' || payment.collectorOrganizationId !== collector)
      throw notFound('Payment not found');
    if (payment.status !== 'reported') {
      throw conflict('This payment is not waiting for verification', 'PAYMENT_NOT_REPORTED');
    }
    return payment;
  }

  /**
   * Voids pending payments whose booking was cancelled or expired; money that still arrives for
   * them is refunded by `receive` either way. Lazy, like the release of expired holds.
   */
  private async voidStale(): Promise<void> {
    await this.database.db
      .update(payments)
      .set({ status: 'cancelled' })
      .where(
        and(
          eq(payments.status, 'pending'),
          inArray(
            payments.tripPackId,
            this.database.db
              .select({ id: tripPacks.id })
              .from(tripPacks)
              .where(ne(tripPacks.status, 'pending_payment')),
          ),
        ),
      );
    await this.database.db
      .update(payments)
      .set({ status: 'cancelled' })
      .where(
        and(
          eq(payments.status, 'pending'),
          inArray(
            payments.bookingId,
            this.database.db
              .select({ id: bookings.id })
              .from(bookings)
              .where(ne(bookings.status, 'held')),
          ),
        ),
      );
  }

  private async requireHeld(
    userId: string,
    bookingId: string,
  ): Promise<{ booking: BookingRow; organizationId: string }> {
    await expireHolds(this.database.db);
    await this.voidStale();
    const [row] = await this.database.db
      .select({ booking: bookings, organizationId: trips.organizationId })
      .from(bookings)
      .innerJoin(trips, eq(trips.id, bookings.tripId))
      .where(and(eq(bookings.id, bookingId), eq(bookings.userId, userId)));
    if (!row) throw notFound('Booking not found');
    if (row.booking.status !== 'held' || !row.booking.expiresAt) {
      throw conflict(
        'This booking is no longer waiting for payment',
        'BOOKING_NOT_AWAITING_PAYMENT',
      );
    }
    return row;
  }

  /** The operator's id when it collects its own payments (ADR-027), else null (the platform). */
  private async collectorFor(organizationId: string): Promise<string | null> {
    const { paymentCollection } = await policyFor(this.database.db, organizationId);
    return paymentCollection === 'operator' ? organizationId : null;
  }

  private async optionsFor(
    booking: BookingRow,
    organizationId: string,
    collector: string | null,
  ): Promise<PaymentOption[]> {
    const rows = await this.database.db
      .select({ currency: exchangeRates.currency, unitsPerUsd: exchangeRates.unitsPerUsd })
      .from(exchangeRates)
      .where(eq(exchangeRates.organizationId, organizationId));
    return this.convertedOptions(booking.totalAmount, booking.currency, rows, collector);
  }

  /** Trip packs: the platform sells them, at its own rates, into its own accounts. */
  private async packOptionsFor(pack: {
    price: string;
    currency: Currency;
  }): Promise<PaymentOption[]> {
    // Only fresh rates: the bolívar moves fast, and the platform bears the loss of a stale one.
    const rows = await this.database.db
      .select()
      .from(platformExchangeRates)
      .where(
        gt(
          platformExchangeRates.updatedAt,
          new Date(Date.now() - PLATFORM_RATE_MAX_HOURS * 3600_000),
        ),
      );
    return this.convertedOptions(pack.price, pack.currency, rows, null);
  }

  private async convertedOptions(
    amount: string,
    from: Currency,
    rateRows: { currency: RateCurrency; unitsPerUsd: string }[],
    collector: string | null,
  ): Promise<PaymentOption[]> {
    const rates = new Map<RateCurrency, string>(rateRows.map((r) => [r.currency, r.unitsPerUsd]));
    const available = this.provider ? await this.provider.methods(collector) : [];
    return PAYMENT_METHODS.flatMap((method) => {
      if (!available.includes(method)) return [];
      const currency = PAYMENT_METHOD_CURRENCY[method];
      const converted = convert(amount, from, currency, rates);
      return converted ? [{ method, currency, ...converted }] : [];
    });
  }
}

/** Other payments of the same booking or trip pack. */
const sameSubject = (payment: Pick<PaymentRow, 'bookingId' | 'tripPackId'>) =>
  payment.tripPackId
    ? eq(payments.tripPackId, payment.tripPackId)
    : eq(payments.bookingId, payment.bookingId!);

/** Payments received by an operator, or (null) by the platform. */
export const collectedBy = (collector: string | null) =>
  collector
    ? eq(payments.collectorOrganizationId, collector)
    : isNull(payments.collectorOrganizationId);

function assertRates(input: ReplaceExchangeRatesRequest) {
  const currencies = input.rates.map((r) => r.currency);
  if (new Set(currencies).size !== currencies.length) {
    throw new ApiException(
      'VALIDATION_FAILED',
      'Each currency can appear only once',
      HttpStatus.BAD_REQUEST,
    );
  }
  for (const rate of input.rates) {
    if (toScaled(rate.unitsPerUsd, 4) <= 0n) {
      throw new ApiException(
        'VALIDATION_FAILED',
        'Rates must be greater than zero',
        HttpStatus.BAD_REQUEST,
      );
    }
  }
}

function toAccount(row: PaymentAccountRow): PaymentAccount {
  return {
    method: row.method,
    fields: row.fields,
    active: row.active,
    updatedAt: row.updatedAt.toISOString(),
  };
}

function randomCode(length: number): string {
  let code = '';
  for (let i = 0; i < length; i++) code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return code;
}
