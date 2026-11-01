import {
  formatPaymentAmount,
  todayInVenezuela,
  type OccupancyReport,
  type OrganizationMembershipSummary,
  type SalesReport,
} from '@vtp/shared-types';
import Link from 'next/link';
import { Suspense } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { formatDate } from '@/lib/labels';
import { apiFetch } from '@/lib/server/api';

export default function ReportsPage({
  params,
  searchParams,
}: PageProps<'/portal/organizations/[organizationId]/reports'>) {
  return (
    <Suspense fallback={<p className="text-muted-foreground">Cargando…</p>}>
      <Reports params={params} searchParams={searchParams} />
    </Suspense>
  );
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const day = (raw: string | string[] | undefined) =>
  typeof raw === 'string' && DATE.test(raw) ? raw : undefined;

/** "10/2026" style label for a YYYY-MM-DD in Venezuelan time. */
const shortDate = (isoDate: string) => formatDate(`${isoDate}T12:00:00-04:00`);

async function Reports({
  params,
  searchParams,
}: {
  params: Promise<{ organizationId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { organizationId } = await params;
  const query = await searchParams;
  const to = day(query.to) ?? todayInVenezuela();
  const from =
    day(query.from) ??
    new Date(Date.parse(`${to}T00:00:00Z`) - 29 * 86_400_000).toISOString().slice(0, 10);
  const base = `/organizations/${encodeURIComponent(organizationId)}`;
  const range = `from=${from}&to=${to}`;
  const { organization, permissions } = await apiFetch<OrganizationMembershipSummary>(base);
  const canSales = permissions.includes('finance.view');
  const canOccupancy = permissions.includes('bookings.view');
  const [sales, occupancy] = await Promise.all([
    canSales ? apiFetch<SalesReport>(`${base}/reports/sales?${range}`) : null,
    canOccupancy ? apiFetch<OccupancyReport>(`${base}/reports/occupancy?${range}`) : null,
  ]);
  const exportHref = (kind: string) =>
    `/portal/organizations/${organization.id}/reports/export?kind=${kind}&${range}`;

  return (
    <>
      <div className="flex flex-col gap-2">
        <Link
          href={`/portal/organizations/${organization.id}`}
          className="text-sm text-muted-foreground hover:underline"
        >
          ← {organization.tradeName ?? organization.legalName}
        </Link>
        <h1 className="text-2xl font-semibold">Reportes</h1>
        <p className="text-sm text-muted-foreground">
          Días de Venezuela, ambos incluidos (hasta un año). Las ventas cuentan el día en que se
          pagó o se canceló cada reserva; la ocupación, el día de cada salida.
        </p>
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

      {sales ? (
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-col gap-1">
              <CardTitle>Ventas</CardTitle>
              <CardDescription>
                Reservas pagadas menos cancelaciones, en la moneda de la tarifa.
              </CardDescription>
            </div>
            <Button asChild size="sm" variant="outline">
              <a href={exportHref('sales')}>Descargar CSV</a>
            </Button>
          </div>
          {sales.totals.length === 0 ? (
            <p className="text-sm text-muted-foreground">No hubo ventas en estas fechas.</p>
          ) : (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                {sales.totals.map((t) => (
                  <div key={t.currency} className="rounded-lg border p-4">
                    <p className="text-sm text-muted-foreground">Para la empresa ({t.currency})</p>
                    <p className="text-2xl font-semibold tabular-nums">
                      {formatPaymentAmount(t.earned, t.currency)}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {t.bookings} reservas · {t.seats} puestos · vendido{' '}
                      {formatPaymentAmount(t.gross, t.currency)} · comisión{' '}
                      {formatPaymentAmount(t.commission, t.currency)}
                      {t.cancellations
                        ? ` · ${t.cancellations} canceladas (${formatPaymentAmount(t.refunded, t.currency)} devueltos)`
                        : ''}
                    </p>
                  </div>
                ))}
              </div>
              <Table
                head={['Ruta', 'Reservas', 'Puestos', 'Vendido', 'Para la empresa', 'Canceladas']}
                rows={sales.byRoute.map((r) => [
                  r.route.name,
                  r.bookings,
                  r.seats,
                  formatPaymentAmount(r.gross, r.currency),
                  formatPaymentAmount(r.earned, r.currency),
                  r.cancellations,
                ])}
              />
              <Table
                head={['Día', 'Puestos', 'Vendido', 'Para la empresa']}
                rows={sales.byDay.map((d) => [
                  shortDate(d.date),
                  d.seats,
                  formatPaymentAmount(d.gross, d.currency),
                  formatPaymentAmount(d.earned, d.currency),
                ])}
              />
            </>
          )}
        </Card>
      ) : null}

      {occupancy ? (
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-col gap-1">
              <CardTitle>Ocupación</CardTitle>
              <CardDescription>
                Puestos vendidos y abordados de cada salida con reservas.
              </CardDescription>
            </div>
            <Button asChild size="sm" variant="outline">
              <a href={exportHref('occupancy')}>Descargar CSV</a>
            </Button>
          </div>
          {occupancy.departures.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No hubo salidas con reservas en estas fechas.
            </p>
          ) : (
            <>
              <Table
                head={['Ruta', 'Salidas', 'Capacidad', 'Vendidos', 'Abordaron', 'Ocupación']}
                rows={occupancy.byRoute.map((r) => [
                  r.route.name,
                  r.departures,
                  r.capacity,
                  r.soldSeats,
                  r.boardedSeats,
                  `${r.occupancy} %`,
                ])}
              />
              <Table
                head={['Salida', 'Ruta', 'Capacidad', 'Vendidos', 'Abordaron', 'Ocupación']}
                rows={occupancy.departures.map((d) => [
                  `${shortDate(d.serviceDate)} ${d.departsAt.slice(11, 16)}`,
                  d.route.name,
                  d.capacity,
                  d.soldSeats,
                  d.boardedSeats,
                  `${d.occupancy} %`,
                ])}
              />
            </>
          )}
        </Card>
      ) : null}
    </>
  );
}

function Table({ head, rows }: { head: string[]; rows: (string | number)[][] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-left text-muted-foreground">
          <tr>
            {head.map((h, i) => (
              <th key={h} className={`py-2 pr-4 font-normal ${i ? 'text-right' : ''}`}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="tabular-nums">
          {rows.map((row, r) => (
            <tr key={r} className="border-t">
              {row.map((cell, i) => (
                <td key={i} className={`py-2 pr-4 ${i ? 'text-right' : ''}`}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
