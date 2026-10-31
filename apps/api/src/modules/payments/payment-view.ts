import type { Payment } from '@vtp/shared-types';
import type { PaymentRow } from './payments.schema.js';

export function toPayment(row: PaymentRow): Payment {
  return {
    id: row.id,
    bookingId: row.bookingId,
    method: row.method,
    status: row.status,
    amount: row.amount,
    currency: row.currency,
    rate: row.rate,
    reference: row.reference,
    instructions: row.instructions,
    simulated: row.provider === 'simulated',
    expiresAt: row.status === 'pending' && row.expiresAt ? row.expiresAt.toISOString() : null,
    confirmedAt: row.confirmedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * The payment worth showing with a booking: the pending one while the booking is held, else the
 * latest that took money. A pending payment of a booking that is no longer held is stale (see
 * `PaymentsService.voidStale`).
 */
export function currentPayment(rows: PaymentRow[], bookingHeld: boolean): PaymentRow | undefined {
  return (
    (bookingHeld ? rows.find((p) => p.status === 'pending') : undefined) ??
    rows
      .filter(
        (p) => p.status === 'confirmed' || p.status === 'refund_due' || p.status === 'refunded',
      )
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0]
  );
}
