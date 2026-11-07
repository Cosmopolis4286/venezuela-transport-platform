import {
  PAYMENT_REVIEW_HOLD_HOURS,
  type PaymentAccount,
  type PaymentReview,
} from '@vtp/shared-types';
import { PaymentAccountsEditor, PaymentReviewList } from '@/components/portal/payment-queues';
import { Card, CardDescription, CardTitle } from '@/components/ui/card';
import { apiFetch } from '@/lib/server/api';
import { requirePlatformAdmin } from '@/lib/server/session';
import { confirmPayment, rejectPayment, removeAccount, saveAccount } from './actions';

export default async function AdminPaymentsPage() {
  await requirePlatformAdmin();
  const [queue, accounts] = await Promise.all([
    apiFetch<PaymentReview[]>('/admin/payments/review'),
    apiFetch<PaymentAccount[]>('/admin/payment-accounts'),
  ]);
  return (
    <>
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold">Pagos</h1>
        <p className="text-sm text-muted-foreground">
          Los pasajeros pagan a las cuentas de la plataforma y escriben el número de operación.
          Búscalo en el banco o la billetera y confirma o rechaza. Mientras esperan, sus puestos
          quedan apartados hasta {PAYMENT_REVIEW_HOLD_HOURS} horas (nunca después de la salida).
        </p>
      </div>

      <Card>
        <div className="flex flex-col gap-1">
          <CardTitle>Por verificar · {queue.length}</CardTitle>
          <CardDescription>Los más antiguos primero.</CardDescription>
        </div>
        <PaymentReviewList
          queue={queue}
          confirm={confirmPayment}
          reject={rejectPayment}
          showOperator
        />
      </Card>

      <Card>
        <div className="flex flex-col gap-1">
          <CardTitle>Cuentas de cobro</CardTitle>
          <CardDescription>
            Los pasajeros ven estos datos al pagar. Solo se ofrecen los métodos con una cuenta
            activa.
          </CardDescription>
        </div>
        <PaymentAccountsEditor accounts={accounts} save={saveAccount} remove={removeAccount} />
      </Card>
    </>
  );
}
