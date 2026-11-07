import type { RefundDuePayment } from '@vtp/shared-types';
import { RefundDueList } from '@/components/portal/payment-queues';
import { Card, CardDescription, CardTitle } from '@/components/ui/card';
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
        <RefundDueList refunds={refunds} markRefunded={markRefunded} showOperator />
      </Card>
    </>
  );
}
