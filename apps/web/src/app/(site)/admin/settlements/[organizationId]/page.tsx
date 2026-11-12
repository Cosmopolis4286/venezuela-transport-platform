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
import { RefundTierFields } from '@/components/portal/refund-policy';
import {
  PayoutLine,
  DriverBalances,
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
import { createPayout, setOrganizationPolicy, voidPayout } from '../actions';

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
          <CardTitle>Conductores</CardTitle>
          <CardDescription>
            Rutas que les pagan a sus conductores (ADR-030). Haz la transferencia a la cuenta que
            indicó cada conductor y regístrala aquí; no se le puede pagar más que su saldo.
          </CardDescription>
        </div>
        <DriverBalances
          drivers={settlement.drivers}
          pay={(row) => (
            <ActionForm
              action={createPayout}
              hidden={{
                ...hidden,
                driverUserId: row.driver!.id,
                currency: row.currency,
                direction: 'to_operator',
              }}
              resetOnSuccess
            >
              <div className="grid gap-2 sm:grid-cols-4">
                <Input
                  name="amount"
                  inputMode="decimal"
                  required
                  defaultValue={row.balance}
                  aria-label={`Monto para ${row.driver!.name}`}
                />
                <Select
                  name="method"
                  defaultValue={row.payoutAccount?.method ?? 'pago_movil'}
                  aria-label="Medio"
                >
                  {PAYOUT_METHODS.map((method) => (
                    <option key={method} value={method}>
                      {PAYOUT_METHOD_LABELS[method]}
                    </option>
                  ))}
                </Select>
                <Input name="reference" required maxLength={120} placeholder="Referencia" />
                <SubmitButton size="sm">Registrar pago al conductor</SubmitButton>
              </div>
            </ActionForm>
          )}
        />
      </Card>

      <Card>
        <div className="flex flex-col gap-1">
          <CardTitle>Política de esta empresa</CardTitle>
          <CardDescription>
            Deja la comisión vacía y desmarca los tramos propios para usar la política general. Los
            cambios se aplican desde ahora: las reservas ya pagadas conservan su comisión.
          </CardDescription>
        </div>
        <ActionForm action={setOrganizationPolicy} hidden={hidden}>
          <Field label="Comisión (%)" htmlFor="commissionRate">
            <Input
              id="commissionRate"
              name="commissionRate"
              inputMode="decimal"
              className="w-32"
              placeholder="por defecto"
              defaultValue={settlement.commissionOverride ?? ''}
            />
          </Field>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="ownTiers"
              defaultChecked={settlement.refundTiersOverride !== null}
            />
            Tramos de reembolso propios (si no, los generales)
          </label>
          <RefundTierFields tiers={settlement.refundTiers} />
          <Field
            label="¿Quién recibe los pagos de los pasajeros?"
            htmlFor="paymentCollection"
            hint="Si cobra la empresa, usa sus propias cuentas, verifica sus pagos y sus reembolsos en el portal, y le debe la comisión a la plataforma. Aplica a los pagos que empiecen desde ahora."
          >
            <Select
              id="paymentCollection"
              name="paymentCollection"
              className="max-w-sm"
              defaultValue={settlement.paymentCollection}
            >
              <option value="platform">La plataforma (por defecto)</option>
              <option value="operator">La empresa, en sus propias cuentas</option>
            </Select>
          </Field>
          <div>
            <SubmitButton variant="outline">Guardar política</SubmitButton>
          </div>
        </ActionForm>
      </Card>

      <Card>
        <div className="flex flex-col gap-1">
          <CardTitle>Registrar un pago</CardTitle>
          <CardDescription>
            Primero haz (o recibe) la transferencia; luego regístrala aquí con su referencia. No se
            puede pagar a la empresa más que su saldo, ni cobrarle más de lo que debe.
          </CardDescription>
        </div>
        {owed.length === 0 ? (
          <p className="text-sm text-muted-foreground">No hay saldo pendiente.</p>
        ) : (
          <ActionForm action={createPayout} hidden={hidden} resetOnSuccess>
            <Field label="Tipo" htmlFor="direction">
              <Select
                id="direction"
                name="direction"
                className="max-w-sm"
                defaultValue={owed[0]!.balance.startsWith('-') ? 'from_operator' : 'to_operator'}
              >
                <option value="to_operator">Pago de la plataforma a la empresa</option>
                <option value="from_operator">Pago de la empresa a la plataforma (comisión)</option>
              </Select>
            </Field>
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
