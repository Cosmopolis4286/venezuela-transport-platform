import type { OccupancyReport, SalesReport } from '@vtp/shared-types';
import { toCsv } from '@/lib/csv';
import { ApiError, apiRequest } from '@/lib/server/api';

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * CSV of a report (`?kind=sales|occupancy&from=&to=`). The API checks the caller's permission;
 * this handler only turns its JSON into a spreadsheet.
 */
export async function GET(
  request: Request,
  { params }: RouteContext<'/portal/organizations/[organizationId]/reports/export'>,
) {
  const { organizationId } = await params;
  const url = new URL(request.url);
  const kind = url.searchParams.get('kind');
  const from = url.searchParams.get('from') ?? '';
  const to = url.searchParams.get('to') ?? '';
  if ((kind !== 'sales' && kind !== 'occupancy') || !DATE.test(from) || !DATE.test(to)) {
    return new Response('Solicitud inválida', { status: 400 });
  }
  const path = `/organizations/${encodeURIComponent(organizationId)}/reports/${kind}?from=${from}&to=${to}`;
  let csv: string;
  try {
    if (kind === 'sales') {
      const report = await apiRequest<SalesReport>(path);
      csv = toCsv([
        [
          'Ruta',
          'Moneda',
          'Reservas',
          'Puestos',
          'Vendido',
          'Comisión',
          'Para la empresa',
          'Canceladas',
          'Devuelto',
        ],
        ...report.byRoute.map((r) => [
          r.route.name,
          r.currency,
          r.bookings,
          r.seats,
          Number(r.gross),
          Number(r.commission),
          Number(r.earned),
          r.cancellations,
          Number(r.refunded),
        ]),
      ]);
    } else {
      const report = await apiRequest<OccupancyReport>(path);
      csv = toCsv([
        ['Fecha', 'Hora', 'Ruta', 'Capacidad', 'Vendidos', 'Abordaron', 'Ocupación %'],
        ...report.departures.map((d) => [
          d.serviceDate,
          d.departsAt.slice(11, 16),
          d.route.name,
          d.capacity,
          d.soldSeats,
          d.boardedSeats,
          d.occupancy,
        ]),
      ]);
    }
  } catch (error) {
    const status = error instanceof ApiError ? error.status : 502;
    return new Response(status === 404 ? 'No encontrado' : 'No autorizado', {
      status: status === 404 ? 404 : status === 400 ? 400 : 403,
    });
  }
  return new Response(csv, {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="vtp-${kind === 'sales' ? 'ventas' : 'ocupacion'}-${from}-a-${to}.csv"`,
      'cache-control': 'no-store',
    },
  });
}
