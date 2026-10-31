import {
  type OrganizationMembershipSummary,
  type OrganizationSettlement,
  type Payout,
  type SettlementEntry,
} from '@vtp/shared-types';
import Link from 'next/link';
import { Suspense } from 'react';
import {
  PayoutLine,
  SettlementBalances,
  SettlementEntries,
} from '@/components/portal/settlement-summary';
import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { monthParam } from '@/lib/month';
import { apiFetch } from '@/lib/server/api';

export default function SettlementPage({
  params,
  searchParams,
}: PageProps<'/portal/organizations/[organizationId]/settlement'>) {
  return (
    <Suspense fallback={<p className="text-muted-foreground">Cargando…</p>}>
      <Settlement params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function Settlement({
  params,
  searchParams,
}: {
  params: Promise<{ organizationId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { organizationId } = await params;
  const month = monthParam((await searchParams).month);
  const base = `/organizations/${encodeURIComponent(organizationId)}`;
  const [{ organization }, settlement, entries, payouts] = await Promise.all([
    apiFetch<OrganizationMembershipSummary>(base),
    apiFetch<OrganizationSettlement>(`${base}/settlement`),
    apiFetch<SettlementEntry[]>(`${base}/settlement/entries?month=${month}`),
    apiFetch<Payout[]>(`${base}/payouts`),
  ]);

  return (
    <>
      <div className="flex flex-col gap-2">
        <Link
          href={`/portal/organizations/${organization.id}`}
          className="text-sm text-muted-foreground hover:underline"
        >
          ← {organization.tradeName ?? organization.legalName}
        </Link>
        <h1 className="text-2xl font-semibold">Liquidaciones</h1>
        <p className="text-sm text-muted-foreground">
          Los pasajeros le pagan a la plataforma. Por cada reserva pagada, la empresa gana la tarifa
          menos la comisión, en la moneda de la tarifa; la plataforma le transfiere ese saldo.
        </p>
      </div>

      <Card>
        <CardTitle>Saldo</CardTitle>
        <SettlementBalances settlement={settlement} />
      </Card>

      <Card>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="flex flex-col gap-1">
            <CardTitle>Reservas pagadas</CardTitle>
            <CardDescription>Por la fecha en que se confirmó el pago.</CardDescription>
          </div>
          <form className="flex gap-2">
            <Input type="month" name="month" defaultValue={month} aria-label="Mes" />
            <Button type="submit" variant="outline">
              Ver
            </Button>
          </form>
        </div>
        <SettlementEntries entries={entries} />
      </Card>

      <Card>
        <CardTitle>Pagos recibidos de la plataforma</CardTitle>
        {payouts.length === 0 ? (
          <p className="text-sm text-muted-foreground">Todavía no hay pagos.</p>
        ) : (
          <ul className="flex flex-col divide-y">
            {payouts.map((payout) => (
              <PayoutLine key={payout.id} payout={payout} />
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
