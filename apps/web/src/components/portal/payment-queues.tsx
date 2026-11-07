import {
  formatPaymentAmount,
  PAYMENT_ACCOUNT_FIELDS,
  PAYMENT_METHOD_LABELS,
  PAYMENT_METHODS,
  type PaymentAccount,
  type PaymentReview,
  type RefundDuePayment,
} from '@vtp/shared-types';
import type { FormState } from '@/lib/form-state';
import { ActionForm, SubmitButton } from '@/components/portal/action-form';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/label';
import { formatDate } from '@/lib/labels';

type Action = (state: FormState, form: FormData) => Promise<FormState>;

const dateTime = (iso: string) =>
  new Intl.DateTimeFormat('es-VE', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'America/Caracas',
  }).format(new Date(iso));

/**
 * Reported manual payments (ADR-027), oldest first, with confirm and reject. Used by platform
 * admins and by operators that collect their own payments; `hidden` carries the organization id.
 */
export function PaymentReviewList({
  queue,
  confirm,
  reject,
  hidden = {},
  showOperator = false,
}: {
  queue: PaymentReview[];
  confirm: Action;
  reject: Action;
  hidden?: Record<string, string>;
  showOperator?: boolean;
}) {
  if (queue.length === 0) {
    return <p className="text-sm text-muted-foreground">No hay pagos por verificar.</p>;
  }
  return (
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
              {dateTime(booking.departsAt)}
              {showOperator ? ` · ${operator.name}` : ''}
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
            <ActionForm action={confirm} hidden={{ ...hidden, paymentId: payment.id }}>
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
            <ActionForm action={reject} hidden={{ ...hidden, paymentId: payment.id }}>
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
  );
}

/** One form per payment method; `save`/`remove` are null when the viewer may only look. */
export function PaymentAccountsEditor({
  accounts,
  save,
  remove,
  hidden = {},
}: {
  accounts: PaymentAccount[];
  save: Action | null;
  remove: Action | null;
  hidden?: Record<string, string>;
}) {
  return (
    <ul className="flex flex-col divide-y">
      {PAYMENT_METHODS.map((method) => {
        const account = accounts.find((a) => a.method === method);
        const title = (
          <p className="font-medium">
            {PAYMENT_METHOD_LABELS[method]} ·{' '}
            {account ? (account.active ? 'activa' : 'inactiva') : 'sin cuenta'}
          </p>
        );
        if (!save) {
          return (
            <li key={method} className="flex flex-col gap-1 py-3">
              {title}
              {account ? (
                <p className="text-sm text-muted-foreground">
                  {PAYMENT_ACCOUNT_FIELDS[method]
                    .map(({ key, label }) => `${label}: ${account.fields[key] ?? ''}`)
                    .join(' · ')}
                </p>
              ) : null}
            </li>
          );
        }
        return (
          <li key={method} className="flex flex-col gap-3 py-3">
            {title}
            <ActionForm action={save} hidden={{ ...hidden, method }}>
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
                  <input type="checkbox" name="active" defaultChecked={account?.active ?? true} />
                  Activa
                </label>
                <div className="flex gap-2">
                  <SubmitButton size="sm">Guardar</SubmitButton>
                </div>
              </div>
            </ActionForm>
            {account && remove ? (
              <ActionForm action={remove} hidden={{ ...hidden, method }}>
                <div>
                  <SubmitButton size="sm" variant="outline">
                    Eliminar cuenta
                  </SubmitButton>
                </div>
              </ActionForm>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

/** Money to send back to payers, with the form to record the refund's reference. */
export function RefundDueList({
  refunds,
  markRefunded,
  hidden = {},
  showOperator = false,
}: {
  refunds: RefundDuePayment[];
  markRefunded: Action;
  hidden?: Record<string, string>;
  showOperator?: boolean;
}) {
  if (refunds.length === 0) {
    return <p className="text-sm text-muted-foreground">No hay pagos por reembolsar.</p>;
  }
  return (
    <ul className="flex flex-col divide-y">
      {refunds.map((r) => (
        <li key={r.paymentId} className="flex flex-col gap-2 py-3">
          <div className="flex flex-col gap-1">
            <p className="font-medium">
              Devolver {formatPaymentAmount(r.refundAmount, r.currency)} por{' '}
              {PAYMENT_METHOD_LABELS[r.method]} · reserva {r.bookingCode}
            </p>
            <p className="text-sm">
              {r.cancellation
                ? 'El pasajero canceló una reserva pagada (reembolso según la política).'
                : 'El dinero no pudo confirmar la reserva (tarde, de menos, en otra moneda o de un pago anulado).'}
            </p>
            <p className="text-sm text-muted-foreground">
              {r.payer.name ?? 'Sin nombre'}
              {r.payer.phone ? ` · ${r.payer.phone}` : ''}
              {r.payer.email ? ` · ${r.payer.email}` : ''}
              {showOperator ? ` · ${r.organization.name}` : ''} · {formatDate(r.createdAt)}
            </p>
            <p className="text-sm text-muted-foreground">
              Pagado {formatPaymentAmount(r.amount, r.currency)}
              {r.receivedAmount && r.receivedAmount !== r.amount
                ? ` (llegó ${formatPaymentAmount(r.receivedAmount, r.currency)})`
                : ''}{' '}
              · referencia {r.reference}
              {r.providerReference ? ` · operación ${r.providerReference}` : ''}
            </p>
          </div>
          <ActionForm action={markRefunded} hidden={{ ...hidden, paymentId: r.paymentId }}>
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
  );
}
