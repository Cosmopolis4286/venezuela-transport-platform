import {
  formatPaymentAmount,
  ORGANIZATION_TYPE_LABELS,
  type AdminSettlementSummary,
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
import { requirePlatformAdmin } from '@/lib/server/session';
import { setPlatformPolicy } from './actions';

export default async function AdminSettlementsPage() {
  await requirePlatformAdmin();
  const [summaries, policy] = await Promise.all([
    apiFetch<AdminSettlementSummary[]>('/admin/settlements'),
    apiFetch<SettlementPolicy>('/admin/settlement-policy'),
  ]);
  return (
    <>
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold">Liquidaciones</h1>
        <p className="text-sm text-muted-foreground">
          Lo que la plataforma le debe a cada empresa por los boletos pagados (tarifa menos
          comisión). Abre una empresa para fijar su comisión o registrar un pago.
        </p>
      </div>
      <Card>
        <div className="flex flex-col gap-1">
          <CardTitle>Política general</CardTitle>
          <CardDescription>
            Para las empresas sin política propia. Hoy: comisión{' '}
            {policy.commissionRate.replace('.', ',')} % · reembolso{' '}
            {describeRefundTiers(policy.refundTiers)}; en rutas suburbanas,{' '}
            {describeRefundTiers(policy.suburbanRefundTiers)}; taxis y motos por tramo: cancelar es
            gratis {policy.rideCancellation.freeMinutes} min después de que una línea lo toma, luego
            cuesta el {policy.rideCancellation.feePercent} % de la tarifa. Los cambios se aplican
            desde ahora.
          </CardDescription>
        </div>
        <ActionForm action={setPlatformPolicy}>
          <Field label="Comisión (%)" htmlFor="commissionRate">
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
