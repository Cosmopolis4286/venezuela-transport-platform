import {
  CURRENCIES,
  PAYOUT_METHODS,
  PAYOUT_METHOD_LABELS,
  ORGANIZATION_TYPE_LABELS,
  type AdminSettlementSummary,
  type Payout,
  type SettlementEntry,
} from '@vtp/shared-types';
import Link from 'next/link';
import { Suspense } from 'react';
import { ActionForm, SubmitButton } from '@/components/portal/action-form';
import {
  PayoutLine,
  SettlementBalances,
  SettlementEntries,
} from '@/components/portal/settlement-summary';
import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardTitle } from '@/components/ui/card';
import { Input, Select } from '@/components/ui/input';
import { Field } from '@/components/ui/label';
import { monthParam } from '@/lib/month';
import { apiFetch } from '@/lib/server/api';
import { requirePlatformAdmin } from '@/lib/server/session';
import { createPayout, setCommission, voidPayout } from '../actions';

export default function AdminOrganizationSettlementPage({
  params,
  searchParams,
}: PageProps<'/admin/settlements/[organizationId]'>) {
  return (
    <Suspense fallback={<p className="text-muted-foreground">Cargando…</p>}>
      <OrganizationSettlementView params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function OrganizationSettlementView({
  params,
  searchParams,
}: {
  params: Promise<{ organizationId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requirePlatformAdmin();
  const { organizationId } = await params;
  const month = monthParam((await searchParams).month);
  const base = `/admin/organizations/${encodeURIComponent(organizationId)}`;
  const [settlement, entries, payouts] = await Promise.all([
    apiFetch<AdminSettlementSummary>(`${base}/settlement`),
    apiFetch<SettlementEntry[]>(`${base}/settlement/entries?month=${month}`),
    apiFetch<Payout[]>(`${base}/payouts`),
  ]);
  const hidden = { organizationId: settlement.organizationId };
  const owed = settlement.balances.filter((b) => b.balance !== '0.00');

  return (
    <>
      <div className="flex flex-col gap-2">
        <Link href="/admin/settlements" className="text-sm text-muted-foreground hover:underline">
          ← Liquidaciones
        </Link>
        <h1 className="text-2xl font-semibold">{settlement.organization.name}</h1>
        <p className="text-sm text-muted-foreground">
          {ORGANIZATION_TYPE_LABELS[settlement.organization.type]} · liquidación
        </p>
      </div>

      <Card>
        <CardTitle>Saldo</CardTitle>
        <SettlementBalances settlement={settlement} />
      </Card>

      <Card>
        <div className="flex flex-col gap-1">
          <CardTitle>Comisión de esta empresa</CardTitle>
          <CardDescription>
            Porcentaje sobre cada boleto. Déjalo vacío para usar el valor por defecto de la
            plataforma. Las reservas ya pagadas conservan la comisión con la que se pagaron.
          </CardDescription>
        </div>
        <ActionForm action={setCommission} hidden={hidden}>
          <div className="flex flex-wrap items-end gap-3">
            <Field label="Comisión (%)" htmlFor="rate">
              <Input
                id="rate"
                name="rate"
                inputMode="decimal"
                className="w-32"
                placeholder="por defecto"
                defaultValue={settlement.commissionOverride ?? ''}
              />
            </Field>
            <SubmitButton variant="outline">Guardar comisión</SubmitButton>
          </div>
        </ActionForm>
      </Card>

      <Card>
        <div className="flex flex-col gap-1">
          <CardTitle>Registrar un pago a la empresa</CardTitle>
          <CardDescription>
            Primero haz la transferencia; luego regístrala aquí con su referencia. No se puede
            pagar más que el saldo de esa moneda.
          </CardDescription>
        </div>
        {owed.length === 0 ? (
          <p className="text-sm text-muted-foreground">No hay saldo por pagar.</p>
        ) : (
          <ActionForm action={createPayout} hidden={hidden} resetOnSuccess>
            <div className="grid gap-3 sm:grid-cols-4">
              <Field label="Moneda" htmlFor="currency">
                <Select id="currency" name="currency" defaultValue={owed[0]!.currency}>
                  {CURRENCIES.map((currency) => (
                    <option key={currency} value={currency}>
                      {currency}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Monto" htmlFor="amount">
                <Input id="amount" name="amount" inputMode="decimal" required />
              </Field>
              <Field label="Medio" htmlFor="method">
                <Select id="method" name="method" defaultValue="bank_transfer">
                  {PAYOUT_METHODS.map((method) => (
                    <option key={method} value={method}>
                      {PAYOUT_METHOD_LABELS[method]}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Referencia" htmlFor="reference">
                <Input id="reference" name="reference" required maxLength={120} />
              </Field>
            </div>
            <Field label="Nota (opcional)" htmlFor="note">
              <Input id="note" name="note" maxLength={500} placeholder="Semana 44" />
            </Field>
            <div>
              <SubmitButton>Registrar pago</SubmitButton>
            </div>
          </ActionForm>
        )}
      </Card>

      <Card>
        <CardTitle>Pagos registrados</CardTitle>
        {payouts.length === 0 ? (
          <p className="text-sm text-muted-foreground">Todavía no hay pagos.</p>
        ) : (
          <ul className="flex flex-col divide-y">
            {payouts.map((payout) => (
              <PayoutLine key={payout.id} payout={payout}>
                {payout.voidedAt ? null : (
                  <ActionForm action={voidPayout} hidden={{ payoutId: payout.id }}>
                    <div className="flex flex-wrap items-end gap-2">
                      <Input
                        name="reason"
                        required
                        minLength={3}
                        maxLength={500}
                        className="max-w-sm"
                        placeholder="Motivo para anularlo"
                        aria-label="Motivo de la anulación"
                      />
                      <SubmitButton size="sm" variant="outline">
                        Anular
                      </SubmitButton>
                    </div>
                  </ActionForm>
                )}
              </PayoutLine>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <CardTitle>Reservas pagadas</CardTitle>
          <form className="flex gap-2">
            <Input type="month" name="month" defaultValue={month} aria-label="Mes" />
            <Button type="submit" variant="outline">
              Ver
            </Button>
          </form>
        </div>
        <SettlementEntries entries={entries} />
      </Card>
    </>
  );
}
