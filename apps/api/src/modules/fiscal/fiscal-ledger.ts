import { and, asc, eq } from 'drizzle-orm';
import { BUYER_ID_TYPES, type BuyerIdType } from '@vtp/shared-types';
import { ApiException } from '../../common/errors/api.exception.js';
import type { Transaction } from '../../database/database.service.js';
import { bookingPassengers, bookings, trips } from '../bookings/bookings.schema.js';
import { organizations } from '../organizations/organizations.schema.js';
import { invoices } from './fiscal.schema.js';

/**
 * Fiscal documents written with the money (ADR-031), inside the same transaction: a draft
 * invoice for the service fee when a booking is paid, and its correction when the operator
 * cancels the departure. Staff issue drafts later; calling these twice does nothing.
 */

const feeDescription = (code: string) => `Tarifa por servicio de la plataforma, reserva ${code}`;

/** Who the fee is invoiced to: the name the passenger asked for, or else the first passenger. */
async function feeBuyer(tx: Transaction, bookingId: string) {
  const [booking] = await tx
    .select({
      name: bookings.billingName,
      idType: bookings.billingIdType,
      idNumber: bookings.billingIdNumber,
      address: bookings.billingAddress,
    })
    .from(bookings)
    .where(eq(bookings.id, bookingId));
  const idType = BUYER_ID_TYPES.find((t) => t === booking?.idType);
  if (booking?.name && idType && booking.idNumber) {
    return {
      buyerName: booking.name,
      buyerIdType: idType,
      buyerIdNumber: booking.idNumber,
      buyerAddress: booking.address,
    };
  }
  const [passenger] = await tx
    .select({
      firstName: bookingPassengers.firstName,
      lastName: bookingPassengers.lastName,
      documentType: bookingPassengers.documentType,
      documentNumber: bookingPassengers.documentNumber,
    })
    .from(bookingPassengers)
    .where(eq(bookingPassengers.bookingId, bookingId))
    .orderBy(asc(bookingPassengers.createdAt), asc(bookingPassengers.seatNumber))
    .limit(1);
  if (!passenger) return null;
  return {
    buyerName: `${passenger.firstName} ${passenger.lastName}`.trim(),
    buyerIdType: passenger.documentType as BuyerIdType,
    buyerIdNumber: passenger.documentNumber,
    buyerAddress: null,
  };
}

/** A draft invoice for the fee of a booking that was just paid. */
export async function draftFeeInvoice(tx: Transaction, bookingId: string): Promise<void> {
  const [booking] = await tx
    .select({
      code: bookings.code,
      serviceFee: bookings.serviceFee,
      currency: bookings.currency,
    })
    .from(bookings)
    .where(eq(bookings.id, bookingId));
  if (!booking?.serviceFee || Number(booking.serviceFee) <= 0) return;
  const buyer = await feeBuyer(tx, bookingId);
  if (!buyer) return;
  await tx
    .insert(invoices)
    .values({
      kind: 'invoice',
      reason: 'service_fee',
      bookingId,
      ...buyer,
      description: feeDescription(booking.code),
      amount: booking.serviceFee,
      currency: booking.currency,
    })
    .onConflictDoNothing({ target: [invoices.bookingId, invoices.reason] });
}

/**
 * The passenger changed who the fee is invoiced to (already saved on the booking): a draft takes
 * the new buyer; an issued or voided invoice can no longer change.
 */
export async function applyBilling(tx: Transaction, bookingId: string): Promise<void> {
  const [invoice] = await tx
    .select({ id: invoices.id, status: invoices.status })
    .from(invoices)
    .where(and(eq(invoices.bookingId, bookingId), eq(invoices.reason, 'service_fee')))
    .for('update');
  if (!invoice) return;
  if (invoice.status !== 'draft') {
    throw ApiException.conflict('The invoice was already issued', 'INVOICE_ALREADY_ISSUED');
  }
  const buyer = await feeBuyer(tx, bookingId);
  if (buyer) {
    await tx
      .update(invoices)
      .set({ ...buyer, updatedAt: new Date() })
      .where(eq(invoices.id, invoice.id));
  }
}

/** `J-12345678-9` → `J`, `12345678-9`. */
export function splitRif(rif: string): { idType: BuyerIdType; idNumber: string } {
  const [type = 'J', ...rest] = rif.split('-');
  const idType = (['V', 'E', 'J', 'G', 'P'] as const).find((t) => t === type) ?? 'J';
  return { idType, idNumber: rest.join('-') || rif };
}

/**
 * The operator cancelled a paid booking's departure: the passenger gets the fee back and the
 * operator bears it (ADR-029). A fee invoice not yet issued is voided; an issued one gets a
 * credit note. Either way the operator is invoiced for the fee.
 */
export async function correctFeeInvoice(tx: Transaction, bookingId: string): Promise<void> {
  const [invoice] = await tx
    .select()
    .from(invoices)
    .where(and(eq(invoices.bookingId, bookingId), eq(invoices.reason, 'service_fee')))
    .for('update');
  if (!invoice || invoice.status === 'voided') return;
  if (invoice.status === 'draft') {
    await tx
      .update(invoices)
      .set({
        status: 'voided',
        voidedAt: new Date(),
        voidReason: 'La empresa canceló la salida antes de emitir la factura',
      })
      .where(eq(invoices.id, invoice.id));
  } else {
    await tx
      .insert(invoices)
      .values({
        kind: 'credit_note',
        reason: 'fee_refund',
        bookingId,
        relatedInvoiceId: invoice.id,
        buyerName: invoice.buyerName,
        buyerIdType: invoice.buyerIdType,
        buyerIdNumber: invoice.buyerIdNumber,
        buyerAddress: invoice.buyerAddress,
        description: `Devolución de la tarifa por servicio: la empresa canceló la salida`,
        amount: invoice.amount,
        currency: invoice.currency,
      })
      .onConflictDoNothing({ target: [invoices.bookingId, invoices.reason] });
  }
  const [operator] = await tx
    .select({
      id: organizations.id,
      legalName: organizations.legalName,
      rif: organizations.rif,
      code: bookings.code,
    })
    .from(bookings)
    .innerJoin(trips, eq(trips.id, bookings.tripId))
    .innerJoin(organizations, eq(organizations.id, trips.organizationId))
    .where(eq(bookings.id, bookingId));
  if (!operator) return;
  const { idType, idNumber } = splitRif(operator.rif);
  await tx
    .insert(invoices)
    .values({
      kind: 'invoice',
      reason: 'operator_cancellation',
      bookingId,
      buyerOrganizationId: operator.id,
      buyerName: operator.legalName,
      buyerIdType: idType,
      buyerIdNumber: idNumber,
      description: `Tarifa por servicio asumida por la empresa al cancelar la salida, reserva ${operator.code}`,
      amount: invoice.amount,
      currency: invoice.currency,
    })
    .onConflictDoNothing({ target: [invoices.bookingId, invoices.reason] });
}
