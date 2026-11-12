import { formatPaymentAmount, todayInVenezuela, type PlatformMetrics } from '@vtp/shared-types';
import { Suspense } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { apiFetch } from '@/lib/server/api';
import { requirePlatformAdmin } from '@/lib/server/session';

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const day = (raw: string | string[] | undefined) =>
  typeof raw === 'string' && DATE.test(raw) ? raw : undefined;

export default function AdminMetricsPage({ searchParams }: PageProps<'/admin/metrics'>) {
  return (
    <Suspense fallback={<p className="text-muted-foreground">Cargando…</p>}>
      <Metrics searchParams={searchParams} />
    </Suspense>
  );
}

async function Metrics({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requirePlatformAdmin();
  const query = await searchParams;
  const to = day(query.to) ?? todayInVenezuela();
  const from =
    day(query.from) ??
    new Date(Date.parse(`${to}T00:00:00Z`) - 29 * 86_400_000).toISOString().slice(0, 10);
  const m = await apiFetch<PlatformMetrics>(`/admin/metrics?from=${from}&to=${to}`);

  const tile = (label: string, value: string | number, detail?: string) => (
    <div className="rounded-lg border p-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="text-2xl font-semibold tabular-nums">{value}</p>
      {detail ? <p className="text-sm text-muted-foreground">{detail}</p> : null}
    </div>
  );

  return (
    <>
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold">Métricas de la plataforma</h1>
        <p className="text-sm text-muted-foreground">Días de Venezuela, ambos incluidos.</p>
      </div>
      <Card>
        <form className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-sm">
            Desde
            <Input type="date" name="from" defaultValue={from} />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Hasta
            <Input type="date" name="to" defaultValue={to} />
          </label>
          <Button type="submit" variant="outline">
            Ver
          </Button>
        </form>
      </Card>

      <Card>
        <div className="flex flex-col gap-1">
          <CardTitle>Ventas de boletos</CardTitle>
          <CardDescription>Pagadas menos cancelaciones, en la moneda de la tarifa.</CardDescription>
        </div>
        {m.sales.length === 0 ? (
          <p className="text-sm text-muted-foreground">No hubo ventas en estas fechas.</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {m.sales.map((s) =>
              tile(
                `Comisión de la plataforma (${s.currency})`,
                formatPaymentAmount(s.commission, s.currency),
                `Vendido ${formatPaymentAmount(s.gross, s.currency)} · ${s.bookings} reservas · ${s.seats} puestos · ${s.cancellations} canceladas`,
              ),
            )}
          </div>
        )}
      </Card>

      <Card>
        <CardTitle>Actividad</CardTitle>
        <div className="grid gap-3 sm:grid-cols-3">
          {tile(
            'Reembolsos por atender',
            m.refundsPending,
            m.refundsSent.length
              ? `Enviados: ${m.refundsSent.map((r) => `${r.count} (${r.amount} ${r.currency})`).join(', ')}`
              : 'Ninguno enviado en estas fechas',
          )}
          {tile('Usuarios nuevos', m.newUsers)}
          {tile(
            'Organizaciones activas',
            m.activeOrganizations.bus_company +
              m.activeOrganizations.taxi_line +
              m.activeOrganizations.terminal,
            `${m.activeOrganizations.bus_company} de autobuses · ${m.activeOrganizations.taxi_line} de taxis · ${m.activeOrganizations.terminal} terminales`,
          )}
          {tile(
            'Taxis pedidos',
            m.taxiRides.requested,
            `${m.taxiRides.completed} terminados · ${m.taxiRides.cancelledOrExpired} cancelados o vencidos`,
          )}
        </div>
      </Card>
    </>
  );
}
