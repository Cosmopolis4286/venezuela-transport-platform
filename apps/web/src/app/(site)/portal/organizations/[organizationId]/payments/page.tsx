import {
  PAYMENT_REVIEW_HOLD_HOURS,
  type OrganizationMembershipSummary,
  type OrganizationSettlement,
  type PaymentAccount,
  type PaymentReview,
  type RefundDuePayment,
} from '@vtp/shared-types';
import Link from 'next/link';
import { Suspense } from 'react';
import {
  PaymentAccountsEditor,
  PaymentReviewList,
  RefundDueList,
} from '@/components/portal/payment-queues';
import { Card, CardDescription, CardTitle } from '@/components/ui/card';
import { apiFetch } from '@/lib/server/api';
import {
  confirmOwnPayment,
  markOwnRefunded,
  rejectOwnPayment,
  removeOwnAccount,
  saveOwnAccount,
} from './actions';

export default function OrganizationPaymentsPage({
  params,
}: PageProps<'/portal/organizations/[organizationId]/payments'>) {
  return (
    <Suspense fallback={<p className="text-muted-foreground">Cargando…</p>}>
      <Payments params={params} />
    </Suspense>
  );
}

async function Payments({ params }: { params: Promise<{ organizationId: string }> }) {
  const { organizationId } = await params;
  const base = `/organizations/${encodeURIComponent(organizationId)}`;
  const [{ organization, permissions }, settlement, accounts] = await Promise.all([
    apiFetch<OrganizationMembershipSummary>(base),
    apiFetch<OrganizationSettlement>(`${base}/settlement`),
    apiFetch<PaymentAccount[]>(`${base}/payment-accounts`),
  ]);
  const canManage = permissions.includes('finance.manage');
  const collects = settlement.paymentCollection === 'operator';
  const [queue, refunds] =
    canManage && collects
      ? await Promise.all([
          apiFetch<PaymentReview[]>(`${base}/payments/review`),
          apiFetch<RefundDuePayment[]>(`${base}/refunds`),
        ])
      : [[], []];
  const hidden = { organizationId: organization.id };

  return (
    <>
      <div className="flex flex-col gap-2">
        <Link
          href={`/portal/organizations/${organization.id}`}
          className="text-sm text-muted-foreground hover:underline"
        >
          ← {organization.tradeName ?? organization.legalName}
        </Link>
        <h1 className="text-2xl font-semibold">Cobros</h1>
        <p className="text-sm text-muted-foreground">
          {collects
            ? `Tu empresa recibe los pagos de los pasajeros en sus propias cuentas. Verifica cada pago informado (los puestos esperan hasta ${PAYMENT_REVIEW_HOLD_HOURS} horas), devuelve los reembolsos y págale a la plataforma su comisión (ver Liquidaciones).`
            : 'La plataforma recibe los pagos de los pasajeros y le paga a tu empresa lo que gana (ver Liquidaciones). Si quieres cobrar con tus propias cuentas, pídeselo a VTP.'}
        </p>
      </div>

      {collects && canManage ? (
        <>
          <Card>
            <div className="flex flex-col gap-1">
              <CardTitle>Por verificar · {queue.length}</CardTitle>
              <CardDescription>
                Busca cada pago en tu banco por el número de operación y el concepto.
              </CardDescription>
            </div>
            <PaymentReviewList
              queue={queue}
              confirm={confirmOwnPayment}
              reject={rejectOwnPayment}
              hidden={hidden}
            />
          </Card>
          <Card>
            <div className="flex flex-col gap-1">
              <CardTitle>Reembolsos · {refunds.length}</CardTitle>
              <CardDescription>
                Devuélvelos por el mismo medio y registra la referencia; avisamos al pasajero.
              </CardDescription>
            </div>
            <RefundDueList refunds={refunds} markRefunded={markOwnRefunded} hidden={hidden} />
          </Card>
        </>
      ) : null}

      {collects ? (
        <Card>
          <div className="flex flex-col gap-1">
            <CardTitle>Tus cuentas de cobro</CardTitle>
            <CardDescription>
              Los pasajeros ven estos datos al pagar. Solo se ofrecen los métodos con una cuenta
              activa.
            </CardDescription>
          </div>
          <PaymentAccountsEditor
            accounts={accounts}
            save={canManage ? saveOwnAccount : null}
            remove={canManage ? removeOwnAccount : null}
            hidden={hidden}
          />
        </Card>
      ) : null}
    </>
  );
}
