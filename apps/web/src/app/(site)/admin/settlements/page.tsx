import {
  DRIVER_DEBT_LIMIT,
  DRIVER_PAYOUT_MINIMUM,
  formatPaymentAmount,
  INDEPENDENT_COMMISSION_NOTICE_DAYS,
  ORGANIZATION_TYPE_LABELS,
  PAYMENT_METHOD_LABELS,
  PAYOUT_METHOD_LABELS,
  type AdminSettlementSummary,
  type DriverDebtReportForReview,
  type IndependentCommission,
  type PendingDriverPayout,
  type SettlementPolicy,
} from '@vtp/shared-types';
import Link from 'next/link';
import { ActionForm, SubmitButton } from '@/components/portal/action-form';
import { describeRefundTiers, RefundTierFields } from '@/components/portal/refund-policy';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardTitle } from '@/components/ui/card';
import { apiFetch } from '@/lib/server/api';
import { requirePlatformPermission } from '@/lib/server/session';
import { formatDate } from '@/lib/labels';
import {
  markPayoutSent,
  reviewDebtReport,
  runDriverPayouts,
  setIndependentCommission,
  setPlatformPolicy,
} from './actions';

export default async function AdminSettlementsPage() {
  await requirePlatformPermission('finance.manage');
  const [summaries, policy, commission, pending, debtReports] = await Promise.all([
    apiFetch<AdminSettlementSummary[]>('/admin/settlements'),
    apiFetch<SettlementPolicy>('/admin/settlement-policy'),
    apiFetch<IndependentCommission>('/admin/independent-commission'),
    apiFetch<PendingDriverPayout[]>('/admin/driver-payouts/pending'),
    apiFetch<DriverDebtReportForReview[]>('/admin/driver-debt-reports'),
  ]);
  const pct = (rate: string) => `${rate.replace('.', ',')} %`;
  return (
    <>
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold">Liquidaciones</h1>
        <p className="text-sm text-muted-foreground">
          Lo que la plataforma le debe a cada empresa por los boletos pagados (la tarifa completa;
          el cargo por servicio que paga el pasajero es de la plataforma). Abre una empresa para
          fijar su cargo o registrar un pago.
        </p>
      </div>
      <Card>
        <div className="flex flex-col gap-1">
          <CardTitle>Conductores independientes</CardTitle>
          <CardDescription>
            Comisión de VTP por cada viaje de la línea de independientes (ADR-045): hoy{' '}
            {pct(commission.rate)}
            {commission.next
              ? `; desde el ${formatDate(commission.next.from)}, ${pct(commission.next.rate)}`
              : ''}
            . Una subida rige {INDEPENDENT_COMMISSION_NOTICE_DAYS} días después de anunciarla y se
            les avisa a los conductores; una baja, desde ahora. En los viajes en efectivo la
            comisión queda como deuda del conductor (con más de{' '}
            {formatPaymentAmount(DRIVER_DEBT_LIMIT.USD, 'USD')} o{' '}
            {formatPaymentAmount(DRIVER_DEBT_LIMIT.VES, 'VES')} no puede conectarse); lo que pague
            se registra en la liquidación de su línea. Cada lunes se crean los pagos a quienes se
            les debe desde {formatPaymentAmount(DRIVER_PAYOUT_MINIMUM.USD, 'USD')} o{' '}
            {formatPaymentAmount(DRIVER_PAYOUT_MINIMUM.VES, 'VES')} y registraron su cuenta.
          </CardDescription>
        </div>
        <ActionForm action={setIndependentCommission}>
          <div className="flex flex-wrap items-end gap-3">
            <Field label="Comisión (%)" htmlFor="independentRate">
              <Input
                id="independentRate"
                name="rate"
                inputMode="decimal"
                className="w-32"
                required
                defaultValue={commission.next?.rate ?? commission.rate}
              />
            </Field>
            <SubmitButton>Guardar comisión</SubmitButton>
          </div>
        </ActionForm>
        <div className="flex flex-col gap-2">
          <p className="font-medium">Pagos de comisiones reportados · {debtReports.length}</p>
          {debtReports.length === 0 ? (
            <p className="text-sm text-muted-foreground">Ningún conductor reportó pagos.</p>
          ) : (
            <ul className="flex flex-col divide-y">
              {debtReports.map((report) => (
                <li key={report.id} className="flex flex-col gap-2 py-3">
                  <p className="text-sm">
                    <span className="font-medium tabular-nums">
                      {formatPaymentAmount(report.amount, report.currency)}
                    </span>{' '}
                    de {report.driver.name} ({report.line}) por{' '}
                    {PAYMENT_METHOD_LABELS[report.method]} · operación {report.reference} · debe{' '}
                    {formatPaymentAmount(report.owed, report.currency)} ·{' '}
                    {formatDate(report.createdAt)}
                  </p>
                  <ActionForm action={reviewDebtReport} hidden={{ reportId: report.id }}>
                    <div className="flex flex-wrap gap-2">
                      <Input
                        name="reason"
                        maxLength={300}
                        placeholder="Motivo (para rechazar)"
                        className="max-w-xs"
                      />
                      <SubmitButton name="decision" value="confirm" size="sm">
                        Llegó: confirmar
                      </SubmitButton>
                      <SubmitButton name="decision" value="reject" size="sm" variant="outline">
                        Rechazar
                      </SubmitButton>
                    </div>
                  </ActionForm>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-medium">Pagos semanales por transferir · {pending.length}</p>
            <ActionForm action={runDriverPayouts}>
              <SubmitButton size="sm" variant="outline">
                Generar los pagos de esta semana
              </SubmitButton>
            </ActionForm>
          </div>
          {pending.length === 0 ? (
            <p className="text-sm text-muted-foreground">No hay pagos pendientes.</p>
          ) : (
            <ul className="flex flex-col divide-y">
              {pending.map((payout) => (
                <li key={payout.id} className="flex flex-col gap-2 py-3">
                  <p className="text-sm">
                    <span className="font-medium tabular-nums">
                      {formatPaymentAmount(payout.amount, payout.currency)}
                    </span>{' '}
                    a {payout.driver?.name ?? '—'} ({payout.line}) ·{' '}
                    {payout.account
                      ? `${PAYOUT_METHOD_LABELS[payout.account.method]} ${payout.account.bank} ${payout.account.account} · ${payout.account.holderId} ${payout.account.holderName}`
                      : 'sin cuenta registrada'}{' '}
                    · {formatDate(payout.createdAt)}
                  </p>
                  <ActionForm action={markPayoutSent} hidden={{ payoutId: payout.id }}>
                    <div className="flex flex-wrap gap-2">
                      <Input
                        name="reference"
                        required
                        maxLength={100}
                        placeholder="Referencia de la transferencia"
                        className="max-w-xs"
                      />
                      <SubmitButton size="sm">Marcar como enviado</SubmitButton>
                    </div>
                  </ActionForm>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Card>

      <Card>
        <div className="flex flex-col gap-1">
          <CardTitle>Política general</CardTitle>
          <CardDescription>
            Para las empresas sin política propia. Hoy: cargo por servicio{' '}
            {policy.commissionRate.replace('.', ',')} % · reembolso{' '}
            {describeRefundTiers(policy.refundTiers)}; en rutas suburbanas,{' '}
            {describeRefundTiers(policy.suburbanRefundTiers)}; taxis y motos por tramo: cancelar es
            gratis {policy.rideCancellation.freeMinutes} min después de que una línea lo toma, luego
            cuesta el {policy.rideCancellation.feePercent} % de la tarifa. Los cambios se aplican
            desde ahora.
          </CardDescription>
        </div>
        <ActionForm action={setPlatformPolicy}>
          <Field
            label="Cargo por servicio (%)"
            htmlFor="commissionRate"
            hint="Lo paga el pasajero además de la tarifa"
          >
            <Input
              id="commissionRate"
              name="commissionRate"
              inputMode="decimal"
              className="w-32"
              required
              defaultValue={policy.commissionRate}
            />
          </Field>
          <p className="text-sm font-medium">Reembolso en rutas entre ciudades</p>
          <RefundTierFields tiers={policy.refundTiers} />
          <p className="text-sm font-medium">Reembolso en rutas suburbanas (todas las empresas)</p>
          <RefundTierFields tiers={policy.suburbanRefundTiers} prefix="suburban" />
          <p className="text-sm font-medium">Cancelación de taxis y motos por tramo</p>
          <p className="text-sm text-muted-foreground">
            Gratis durante unos minutos después de que una línea toma el viaje (y hasta 30 min antes
            de un viaje programado), y también si el conductor no lo recoge en 20 min. Si no, el
            pasajero paga una tasa en su próximo viaje, para la línea que salió a buscarlo.
          </p>
          <div className="flex flex-wrap gap-3">
            <Field label="Minutos sin costo" htmlFor="freeMinutes">
              <Input
                id="freeMinutes"
                name="freeMinutes"
                type="number"
                min={0}
                max={60}
                className="w-32"
                required
                defaultValue={policy.rideCancellation.freeMinutes}
              />
            </Field>
            <Field label="Tasa (% de la tarifa)" htmlFor="feePercent">
              <Input
                id="feePercent"
                name="feePercent"
                type="number"
                min={0}
                max={100}
                className="w-32"
                required
                defaultValue={policy.rideCancellation.feePercent}
              />
            </Field>
          </div>
          <div>
            <SubmitButton variant="outline">Guardar política general</SubmitButton>
          </div>
        </ActionForm>
      </Card>
      <Card>
        <CardTitle>Empresas · {summaries.length}</CardTitle>
        <CardDescription>
          Las empresas de autobuses activas, y cualquier otra con ventas o pagos registrados.
        </CardDescription>
        {summaries.length === 0 ? (
          <p className="text-sm text-muted-foreground">Todavía no hay empresas activas.</p>
        ) : (
          <ul className="flex flex-col divide-y">
            {summaries.map((s) => {
              const owed = s.balances.filter((b) => b.balance !== '0.00');
              return (
                <li
                  key={s.organization.id}
                  className="flex flex-wrap items-center justify-between gap-3 py-3"
                >
                  <div className="flex flex-col gap-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{s.organization.name}</span>
                      <Badge variant="secondary">
                        {ORGANIZATION_TYPE_LABELS[s.organization.type]}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Comisión {s.commissionRate.replace('.', ',')} %
                      {s.commissionOverride ? ' (acordada)' : ' (por defecto)'} · Por pagar:{' '}
                      {owed.length
                        ? owed.map((b) => formatPaymentAmount(b.balance, b.currency)).join(' + ')
                        : 'nada'}
                    </p>
                  </div>
                  <Button asChild size="sm" variant={owed.length ? 'default' : 'outline'}>
                    <Link href={`/admin/settlements/${s.organization.id}`}>Abrir</Link>
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </>
  );
}
