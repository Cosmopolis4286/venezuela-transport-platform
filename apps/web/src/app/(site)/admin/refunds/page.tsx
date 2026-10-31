import {
  formatPaymentAmount,
  PAYMENT_METHOD_LABELS,
  type RefundDuePayment,
} from '@vtp/shared-types';
import { ActionForm, SubmitButton } from '@/components/portal/action-form';
import { Card, CardDescription, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { formatDate } from '@/lib/labels';
import { apiFetch } from '@/lib/server/api';
import { requirePlatformAdmin } from '@/lib/server/session';
import { markRefunded } from '../settlements/actions';

export default async function AdminRefundsPage() {
  await requirePlatformAdmin();
  const refunds = await apiFetch<RefundDuePayment[]>('/admin/refunds');
  return (
    <>
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold">Reembolsos</h1>
        <p className="text-sm text-muted-foreground">
          Dinero que llegó y no pudo confirmar una reserva: llegó tarde, de menos, en otra moneda o
          para un pago anulado. Devuélvelo por el mismo medio y registra la referencia.
        </p>
      </div>
      <Card>
        <div className="flex flex-col gap-1">
          <CardTitle>Por reembolsar · {refunds.length}</CardTitle>
          <CardDescription>Los más antiguos primero.</CardDescription>
        </div>
        {refunds.length === 0 ? (
          <p className="text-sm text-muted-foreground">No hay pagos por reembolsar.</p>
        ) : (
          <ul className="flex flex-col divide-y">
            {refunds.map((r) => (
              <li key={r.paymentId} className="flex flex-col gap-2 py-3">
                <div className="flex flex-col gap-1">
                  <p className="font-medium">
                    {formatPaymentAmount(r.receivedAmount ?? r.amount, r.currency)} por{' '}
                    {PAYMENT_METHOD_LABELS[r.method]} · reserva {r.bookingCode}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {r.payer.name ?? 'Sin nombre'}
                    {r.payer.phone ? ` · ${r.payer.phone}` : ''}
                    {r.payer.email ? ` · ${r.payer.email}` : ''} · {r.organization.name} ·{' '}
                    {formatDate(r.createdAt)}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Se pedía {formatPaymentAmount(r.amount, r.currency)} · referencia {r.reference}
                    {r.providerReference ? ` · del proveedor ${r.providerReference}` : ''}
                  </p>
                </div>
                <ActionForm action={markRefunded} hidden={{ paymentId: r.paymentId }}>
                  <div className="flex flex-wrap items-end gap-2">
                    <Input
                      name="reference"
                      required
                      maxLength={120}
                      className="max-w-xs"
                      placeholder="Referencia de la devolución"
                      aria-label="Referencia de la devolución"
                    />
                    <SubmitButton size="sm">Marcar como reembolsado</SubmitButton>
                  </div>
                </ActionForm>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
