import { randomInt } from 'node:crypto';
import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import {
  PAYMENT_METHOD_CURRENCY,
  PAYMENT_METHODS,
  type Booking,
  type ExchangeRate,
  type Payment,
  type PaymentCurrency,
  type PaymentMethod,
  type PaymentOption,
  type RateCurrency,
  type ReplaceExchangeRatesRequest,
} from '@vtp/shared-types';
import { and, eq, inArray, ne } from 'drizzle-orm';
import { ApiException } from '../../common/errors/api.exception.js';
import { AppConfigService } from '../../config/app-config.service.js';
import { DatabaseService } from '../../database/database.service.js';
import { AuditService } from '../audit/audit.service.js';
import { bookings, trips, type BookingRow } from '../bookings/bookings.schema.js';
import { BookingsService } from '../bookings/bookings.service.js';
import { expireHolds } from '../bookings/occupancy.js';
import type { Authenticated, RequestMeta } from '../identity/sessions.service.js';
import type { OrganizationAccess } from '../organizations/organization-access.js';
import { recordEarning } from '../settlements/ledger.js';
import { compareAmounts, convert, toScaled } from './money.js';
import { PAYMENT_PROVIDERS, type PaymentProvider } from './payment-provider.js';
import { toPayment } from './payment-view.js';
import { exchangeRates, payments, type PaymentRow } from './payments.schema.js';

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
    @Inject(PAYMENT_PROVIDERS) private readonly providers: PaymentProvider[],
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

  // --- Paying a booking (passengers) ---------------------------------------------------------

  /** Methods the passenger can use now for a held booking, with converted amounts. */
  async options(auth: Authenticated, bookingId: string): Promise<PaymentOption[]> {
    const { booking, organizationId } = await this.requireHeld(auth.user.id, bookingId);
    return this.optionsFor(booking, organizationId);
  }

  /** Starts paying with one method; a pending payment with another method is replaced. */
  async create(
    auth: Authenticated,
    bookingId: string,
    method: PaymentMethod,
    meta: RequestMeta,
  ): Promise<Payment> {
    const { booking, organizationId } = await this.requireHeld(auth.user.id, bookingId);
    const option = (await this.optionsFor(booking, organizationId)).find(
      (o) => o.method === method,
    );
    if (!option)
      throw conflict(
        'This payment method is not available for this booking',
        'PAYMENT_METHOD_UNAVAILABLE',
      );
    const provider = this.providerFor(method)!;

    let payment: PaymentRow | undefined;
    for (let attempt = 0; !payment && attempt < 3; attempt++) {
      const reference = `${booking.code}-${randomCode(2)}`;
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
              provider: provider.name,
              instructions: provider.instructions({
                method,
                amount: option.amount,
                currency: option.currency,
                reference,
              }),
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

  /** Development only: the simulated provider reports the money as received. */
  async simulate(
    auth: Authenticated,
    paymentId: string,
    amount: string | undefined,
  ): Promise<Booking> {
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
    return this.bookings.getMine(auth.user.id, payment.bookingId);
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
      if (payment.status !== 'pending' && payment.status !== 'cancelled') {
        return { payment, outcome: 'duplicate' as const };
      }
      const received = {
        providerReference: incoming.providerReference,
        receivedAmount: incoming.amount,
      };
      const enough =
        incoming.currency === payment.currency &&
        compareAmounts(incoming.amount, payment.amount) >= 0;
      if (payment.status === 'pending' && enough) {
        if (await this.bookings.confirmHeld(tx, payment.bookingId)) {
          await recordEarning(tx, payment.bookingId, this.config.get('PLATFORM_COMMISSION_PERCENT'));
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
                eq(payments.bookingId, payment.bookingId),
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
          provider: incoming.provider,
          providerReference: incoming.providerReference,
          amount: incoming.amount,
          currency: incoming.currency,
        },
      });
    }
    return result.payment;
  }

  get simulatorEnabled(): boolean {
    return this.config.get('PAYMENT_PROVIDER') === 'simulated';
  }

  private providerFor(method: PaymentMethod): PaymentProvider | undefined {
    return this.providers.find((p) => p.supports(method));
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

  private async optionsFor(booking: BookingRow, organizationId: string): Promise<PaymentOption[]> {
    const rows = await this.database.db
      .select({ currency: exchangeRates.currency, unitsPerUsd: exchangeRates.unitsPerUsd })
      .from(exchangeRates)
      .where(eq(exchangeRates.organizationId, organizationId));
    const rates = new Map<RateCurrency, string>(rows.map((r) => [r.currency, r.unitsPerUsd]));
    return PAYMENT_METHODS.flatMap((method) => {
      if (!this.providerFor(method)) return [];
      const currency = PAYMENT_METHOD_CURRENCY[method];
      const converted = convert(booking.totalAmount, booking.currency, currency, rates);
      return converted ? [{ method, currency, ...converted }] : [];
    });
  }
}

function randomCode(length: number): string {
  let code = '';
  for (let i = 0; i < length; i++) code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return code;
}
