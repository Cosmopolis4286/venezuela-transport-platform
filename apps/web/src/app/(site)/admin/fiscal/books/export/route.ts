import type { PurchasesBook, SalesBook } from '@vtp/shared-types';
import { toCsv } from '@/lib/csv';
import { ApiError, apiRequest } from '@/lib/server/api';

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

/**
 * CSV of a fiscal book (`?kind=sales|purchases&month=YYYY-MM`) for the accountant. The API checks
 * that the caller is a platform admin; this handler only turns its JSON into a spreadsheet.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const kind = url.searchParams.get('kind');
  const month = url.searchParams.get('month') ?? '';
  if ((kind !== 'sales' && kind !== 'purchases') || !MONTH.test(month)) {
    return new Response('Solicitud inválida', { status: 400 });
  }
  let csv: string;
  try {
    if (kind === 'sales') {
      const book = await apiRequest<SalesBook>(`/admin/fiscal/books/sales?month=${month}`);
      csv = toCsv([
        [
          'Fecha',
          'Tipo de documento',
          'N.º de documento',
          'N.º de control',
          'Factura afectada',
          'RIF / Cédula',
          'Nombre o razón social',
          'Total con IVA',
          'Ventas no gravadas',
          'Base imponible',
          'Alícuota %',
          'IVA',
          'IVA retenido',
        ],
        ...book.rows.map((r) => [
          r.date,
          r.documentType,
          r.number,
          r.controlNumber,
          r.affectedInvoice,
          r.buyerId,
          r.buyerName,
          Number(r.total),
          Number(r.notTaxed),
          Number(r.base),
          Number(r.vatRate),
          Number(r.vat),
          Number(r.vatWithheld),
        ]),
        [
          'Totales',
          '',
          '',
          '',
          '',
          '',
          '',
          Number(book.summary.total),
          Number(book.summary.notTaxed),
          Number(book.summary.base),
          '',
          Number(book.summary.vat),
          '',
        ],
      ]);
    } else {
      const book = await apiRequest<PurchasesBook>(`/admin/fiscal/books/purchases?month=${month}`);
      csv = toCsv([
        [
          'Fecha',
          'RIF del proveedor',
          'Proveedor',
          'N.º de factura',
          'N.º de control',
          'Total con IVA',
          'Compras exentas',
          'Base imponible',
          'Alícuota %',
          'IVA',
        ],
        ...book.rows.map((r) => [
          r.date,
          r.supplierRif,
          r.supplierName,
          r.invoiceNumber,
          r.controlNumber,
          Number(r.total),
          Number(r.exempt),
          Number(r.base),
          Number(r.vatRate),
          Number(r.vat),
        ]),
        [
          'Totales',
          '',
          '',
          '',
          '',
          Number(book.summary.total),
          Number(book.summary.notTaxed),
          Number(book.summary.base),
          '',
          Number(book.summary.vat),
        ],
      ]);
    }
  } catch (error) {
    const status = error instanceof ApiError ? error.status : 502;
    return new Response('No autorizado', { status: status === 400 ? 400 : 403 });
  }
  return new Response(csv, {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="vtp-libro-${kind === 'sales' ? 'ventas' : 'compras'}-${month}.csv"`,
      'cache-control': 'no-store',
    },
  });
}
