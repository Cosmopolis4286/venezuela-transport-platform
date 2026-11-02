import {
  formatPaymentAmount,
  PAYMENT_ACCOUNT_FIELDS,
  PAYMENT_METHOD_LABELS,
  PAYMENT_METHODS,
  PAYMENT_REVIEW_HOLD_HOURS,
  type PaymentAccount,
  type PaymentReview,
} from '@vtp/shared-types';
import { ActionForm, SubmitButton } from '@/components/portal/action-form';
import { Card, CardDescription, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/label';
import { apiFetch } from '@/lib/server/api';
import { requirePlatformAdmin } from '@/lib/server/session';
import { confirmPayment, rejectPayment, removeAccount, saveAccount } from './actions';

const dateTime = (iso: string) =>
  new Intl.DateTimeFormat('es-VE', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'America/Caracas',
  }).format(new Date(iso));

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
        {queue.length === 0 ? (
          <p className="text-sm text-muted-foreground">No hay pagos por verificar.</p>
        ) : (
          <ul className="flex flex-col divide-y">
            {queue.map(({ payment, booking, operator, payer }) => (
              <li key={payment.id} className="flex flex-col gap-3 py-3">
                <div className="flex flex-col gap-1">
                  <p className="font-medium">
                    {formatPaymentAmount(payment.amount, payment.currency)} por{' '}
                    {PAYMENT_METHOD_LABELS[payment.method]} · operación {payment.payerReference}
                  </p>
                  <p className="text-sm">
                    Concepto {payment.reference} · reserva {booking.code} · {booking.route},{' '}
                    {dateTime(booking.departsAt)} · {operator.name}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {payer.name}
                    {payer.phone ? ` · ${payer.phone}` : ''}
                    {payer.email ? ` · ${payer.email}` : ''} · reportado{' '}
                    {payment.reportedAt ? dateTime(payment.reportedAt) : ''}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {booking.status === 'held' && booking.expiresAt
                      ? `Puestos apartados hasta: ${dateTime(booking.expiresAt)}`
                      : 'El apartado ya terminó: si el dinero llegó, se marcará para reembolso.'}
                  </p>
                </div>
                <div className="flex flex-col gap-2 md:flex-row md:items-end md:gap-6">
                  <ActionForm action={confirmPayment} hidden={{ paymentId: payment.id }}>
                    <div className="flex flex-wrap items-end gap-2">
                      <Input
                        name="receivedAmount"
                        inputMode="decimal"
                        className="w-40"
                        placeholder={payment.amount}
                        aria-label="Monto recibido (vacío: el monto exacto)"
                      />
                      <SubmitButton size="sm">Confirmar</SubmitButton>
                    </div>
                  </ActionForm>
                  <ActionForm action={rejectPayment} hidden={{ paymentId: payment.id }}>
                    <div className="flex flex-wrap items-end gap-2">
                      <Input
                        name="reason"
                        required
                        minLength={3}
                        maxLength={300}
                        className="w-72"
                        placeholder="Por qué (lo verá el pasajero)"
                        aria-label="Motivo del rechazo"
                      />
                      <SubmitButton size="sm" variant="outline">
                        Rechazar
                      </SubmitButton>
                    </div>
                  </ActionForm>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <div className="flex flex-col gap-1">
          <CardTitle>Cuentas de cobro</CardTitle>
          <CardDescription>
            Los pasajeros ven estos datos al pagar. Solo se ofrecen los métodos con una cuenta
            activa.
          </CardDescription>
        </div>
        <ul className="flex flex-col divide-y">
          {PAYMENT_METHODS.map((method) => {
            const account = accounts.find((a) => a.method === method);
            return (
              <li key={method} className="flex flex-col gap-3 py-3">
                <p className="font-medium">
                  {PAYMENT_METHOD_LABELS[method]} ·{' '}
                  {account ? (account.active ? 'activa' : 'inactiva') : 'sin cuenta'}
                </p>
                <ActionForm action={saveAccount} hidden={{ method }}>
                  <div className="grid gap-3 md:grid-cols-4 md:items-end">
                    {PAYMENT_ACCOUNT_FIELDS[method].map(({ key, label }) => (
                      <Field key={key} label={label} htmlFor={`${method}-${key}`}>
                        <Input
                          id={`${method}-${key}`}
                          name={key}
                          required
                          maxLength={120}
                          defaultValue={account?.fields[key] ?? ''}
                        />
                      </Field>
                    ))}
                    <label className="flex h-9 items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        name="active"
                        defaultChecked={account?.active ?? true}
                      />
                      Activa
                    </label>
                    <SubmitButton size="sm">Guardar</SubmitButton>
                  </div>
                </ActionForm>
                {account ? (
                  <ActionForm action={removeAccount} hidden={{ method }}>
                    <SubmitButton size="sm" variant="outline">
                      Eliminar cuenta
                    </SubmitButton>
                  </ActionForm>
                ) : null}
              </li>
            );
          })}
        </ul>
      </Card>
    </>
  );
}
