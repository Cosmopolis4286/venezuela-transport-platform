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
    manual: row.provider === 'manual',
    payerReference: row.payerReference,
    reportedAt: row.reportedAt?.toISOString() ?? null,
    rejectionReason: row.status === 'rejected' ? row.rejectionReason : null,
    expiresAt: row.status === 'pending' && row.expiresAt ? row.expiresAt.toISOString() : null,
    confirmedAt: row.confirmedAt?.toISOString() ?? null,
    refundAmount:
      row.status === 'refund_due' || row.status === 'refunded'
        ? (row.refundAmount ?? row.receivedAmount ?? row.amount)
        : null,
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * The payment worth showing with a booking: the one being paid or verified (or the latest
 * rejected) while the booking is held, else the latest that took money. A pending payment of a
 * booking that is no longer held is stale (see `PaymentsService.voidStale`).
 */
export function currentPayment(rows: PaymentRow[], bookingHeld: boolean): PaymentRow | undefined {
  const latest = (status: PaymentRow['status']) =>
    rows
      .filter((p) => p.status === status)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
  return (
    (bookingHeld
      ? (rows.find((p) => p.status === 'pending' || p.status === 'reported') ?? latest('rejected'))
      : rows.find((p) => p.status === 'reported')) ??
    rows
      .filter(
        (p) => p.status === 'confirmed' || p.status === 'refund_due' || p.status === 'refunded',
      )
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0]
  );
}
