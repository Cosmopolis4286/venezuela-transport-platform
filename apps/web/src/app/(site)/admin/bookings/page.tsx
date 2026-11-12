import {
  BOOKING_STATUS_LABELS,
  formatPaymentAmount,
  INVOICE_STATUS_LABELS,
  localTime,
  normalizeWhatsapp,
  PAYMENT_METHOD_LABELS,
  PAYMENT_STATUS_LABELS,
  whatsappLink,
  type AdminBookingLookup,
} from '@vtp/shared-types';
import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { formatDate } from '@/lib/labels';
import { ApiError, apiFetch } from '@/lib/server/api';
import { requirePlatformStaff } from '@/lib/server/session';

export const metadata: Metadata = { title: 'Buscar reserva' };

export default function BookingLookupPage({ searchParams }: PageProps<'/admin/bookings'>) {
  return (
    <Suspense fallback={<p className="text-muted-foreground">Cargando…</p>}>
      <Lookup searchParams={searchParams} />
    </Suspense>
  );
}

async function Lookup({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requirePlatformStaff();
  const query = await searchParams;
  const code = typeof query.code === 'string' ? query.code.trim() : '';
  let result: AdminBookingLookup | null = null;
  let notFound = false;
  if (code) {
    try {
      result = await apiFetch<AdminBookingLookup>(
        `/admin/bookings/by-code/${encodeURIComponent(code)}`,
      );
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) notFound = true;
      else throw error;
    }
  }

  return (
    <>
      <div className="flex flex-col gap-2">
        <Link href="/admin" className="text-sm text-muted-foreground hover:underline">
          ← Administración
        </Link>
        <h1 className="text-2xl font-semibold">Buscar reserva</h1>
        <p className="text-sm text-muted-foreground">
          Para atender por WhatsApp o correo: escribe el código que te envió el pasajero
          (VTP-7K3QXA, o solo 7K3QXA). Cada búsqueda queda en la auditoría.
        </p>
      </div>
      <Card>
        <form className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-sm">
            Código de reserva
            <Input name="code" defaultValue={code} placeholder="VTP-7K3QXA" required />
          </label>
          <Button type="submit" variant="outline">
            Buscar
          </Button>
        </form>
      </Card>
      {notFound ? (
        <Alert variant="destructive">No hay ninguna reserva con el código «{code}».</Alert>
      ) : null}
      {result ? <BookingDetails result={result} /> : null}
    </>
  );
}

function BookingDetails({ result }: { result: AdminBookingLookup }) {
  const { booking, customer } = result;
  const phone = normalizeWhatsapp(customer.phone);
  const open = booking.trip.headwayMinutes !== null;
  const payment = booking.payment;
  return (
    <>
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex flex-col gap-1">
            <CardTitle>
              {booking.code} · {booking.route.name}
            </CardTitle>
            <CardDescription>
              {booking.operator.tradeName ?? booking.operator.legalName} · {booking.from.name} →{' '}
              {booking.to.name} · {booking.trip.serviceDate}{' '}
              {open
                ? `(boleto abierto, ${localTime(booking.trip.departsAt)}–${localTime(booking.trip.arrivesAt)})`
                : `a las ${localTime(booking.trip.departsAt)}`}
            </CardDescription>
          </div>
          <Badge variant={booking.status === 'confirmed' ? 'success' : 'secondary'}>
            {BOOKING_STATUS_LABELS[booking.status]}
          </Badge>
        </div>
        {booking.trip.cancellation ? (
          <Alert variant="destructive">
            La empresa canceló la salida: {booking.trip.cancellation.reason}
          </Alert>
        ) : null}
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-muted-foreground">Cliente</dt>
            <dd>
              {customer.name ?? '—'}
              {customer.email ? ` · ${customer.email}` : ''}
              {customer.phone ? ` · ${customer.phone}` : ''}
            </dd>
            {phone ? (
              <a
                href={whatsappLink(phone, `Hola, te escribimos por tu reserva ${booking.code}.`)}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm font-medium hover:underline"
              >
                Escribirle por WhatsApp
              </a>
            ) : null}
          </div>
          <div>
            <dt className="text-muted-foreground">Total</dt>
            <dd>
              {formatPaymentAmount(booking.total.amount, booking.total.currency)}
              {booking.serviceFee
                ? ` (incluye cargo por servicio de ${formatPaymentAmount(booking.serviceFee.amount, booking.total.currency)})`
                : ''}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Pago</dt>
            <dd>
              {payment ? (
                <>
                  {PAYMENT_STATUS_LABELS[payment.status]} · {PAYMENT_METHOD_LABELS[payment.method]}{' '}
                  · {formatPaymentAmount(payment.amount, payment.currency)} · ref.{' '}
                  {payment.reference}
                  {payment.payerReference ? ` · operación ${payment.payerReference}` : ''}
                </>
              ) : (
                'Sin pago iniciado'
              )}
            </dd>
            {payment?.status === 'reported' ? (
              <Link href="/admin/payments" className="text-sm font-medium hover:underline">
                Verificar en Pagos →
              </Link>
            ) : null}
            {payment?.status === 'refund_due' ? (
              <Link href="/admin/refunds" className="text-sm font-medium hover:underline">
                Ver en Reembolsos →
              </Link>
            ) : null}
          </div>
          <div>
            <dt className="text-muted-foreground">Factura del cargo por servicio</dt>
            <dd>
              {booking.invoice
                ? `${INVOICE_STATUS_LABELS[booking.invoice.status]}${booking.invoice.number ? ` N.º ${booking.invoice.number}` : ''}`
                : '—'}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Creada</dt>
            <dd>{formatDate(booking.createdAt)}</dd>
          </div>
        </dl>
      </Card>
      <Card>
        <CardTitle>Pasajeros</CardTitle>
        <ul className="flex flex-col divide-y text-sm">
          {booking.passengers.map((p) => (
            <li key={p.seatNumber} className="flex flex-wrap items-center gap-2 py-2">
              <Badge variant="outline">
                {open ? `Boleto ${p.seatNumber}` : `Puesto ${p.seatNumber}`}
              </Badge>
              <span>
                {p.firstName} {p.lastName} · {p.documentType}-{p.documentNumber}
              </span>
              {p.ticket?.boardedAt ? (
                <Badge variant="success">Abordó {formatDate(p.ticket.boardedAt)}</Badge>
              ) : p.ticket ? (
                <Badge variant="secondary">Boleto emitido</Badge>
              ) : null}
            </li>
          ))}
        </ul>
      </Card>
    </>
  );
}
