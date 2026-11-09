import { todayInVenezuela, type PurchasesBook, type SalesBook } from '@vtp/shared-types';
import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import { ActionForm, SubmitButton } from '@/components/portal/action-form';
import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/label';
import { apiFetch } from '@/lib/server/api';
import { requirePlatformAdmin } from '@/lib/server/session';
import { createPurchase, deletePurchase } from '../actions';

export const metadata: Metadata = { title: 'Libros fiscales' };

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

export default function BooksPage({ searchParams }: PageProps<'/admin/fiscal/books'>) {
  return (
    <Suspense fallback={<p className="text-muted-foreground">Cargando…</p>}>
      <Books searchParams={searchParams} />
    </Suspense>
  );
}

async function Books({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requirePlatformAdmin();
  const query = await searchParams;
  const today = todayInVenezuela();
  const month =
    typeof query.month === 'string' && MONTH.test(query.month) ? query.month : today.slice(0, 7);
  const [sales, purchases] = await Promise.all([
    apiFetch<SalesBook>(`/admin/fiscal/books/sales?month=${month}`),
    apiFetch<PurchasesBook>(`/admin/fiscal/books/purchases?month=${month}`),
  ]);
  const num = 'py-1 pr-2 text-right tabular-nums';
  const head = 'py-1 pr-2 font-medium';

  return (
    <>
      <div className="flex flex-col gap-2">
        <Link href="/admin/fiscal" className="text-sm text-muted-foreground hover:underline">
          ← Facturación
        </Link>
        <h1 className="text-2xl font-semibold">Libros de ventas y compras</h1>
        <p className="text-sm text-muted-foreground">
          Montos en bolívares. El libro de ventas lista los documentos emitidos en el mes; las notas
          de crédito restan y los anulados quedan con monto cero. Descarga el CSV para tu contador y
          la declaración de IVA.
        </p>
      </div>
      <Card>
        <form className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-sm">
            Mes
            <Input type="month" name="month" defaultValue={month} />
          </label>
          <Button type="submit" variant="outline">
            Ver
          </Button>
        </form>
      </Card>

      <Card>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex flex-col gap-1">
            <CardTitle>Libro de ventas · {month}</CardTitle>
            <CardDescription>
              Total Bs {sales.summary.total} · Base Bs {sales.summary.base} · IVA Bs{' '}
              {sales.summary.vat} · No gravado Bs {sales.summary.notTaxed}
            </CardDescription>
          </div>
          <Button asChild size="sm" variant="outline">
            <a href={`/admin/fiscal/books/export?kind=sales&month=${month}`}>Descargar CSV</a>
          </Button>
        </div>
        {sales.rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No hay documentos emitidos este mes.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-muted-foreground">
                <tr>
                  <th className={head}>Fecha</th>
                  <th className={head}>Tipo</th>
                  <th className={head}>N.º</th>
                  <th className={head}>Control</th>
                  <th className={head}>Comprador</th>
                  <th className={`${head} text-right`}>Total</th>
                  <th className={`${head} text-right`}>Base</th>
                  <th className={`${head} text-right`}>IVA</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {sales.rows.map((row) => (
                  <tr key={`${row.documentType}-${row.number}`}>
                    <td className="py-1 pr-2">{row.date}</td>
                    <td className="py-1 pr-2">
                      {row.documentType}
                      {row.affectedInvoice ? ` (fac. ${row.affectedInvoice})` : ''}
                    </td>
                    <td className="py-1 pr-2">{row.number}</td>
                    <td className="py-1 pr-2">{row.controlNumber}</td>
                    <td className="py-1 pr-2">
                      {row.buyerName} · {row.buyerId}
                    </td>
                    <td className={num}>{row.total}</td>
                    <td className={num}>{row.base}</td>
                    <td className={num}>{row.vat}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex flex-col gap-1">
            <CardTitle>Libro de compras · {month}</CardTitle>
            <CardDescription>
              Total Bs {purchases.summary.total} · Base Bs {purchases.summary.base} · IVA Bs{' '}
              {purchases.summary.vat} · Exento Bs {purchases.summary.notTaxed}
            </CardDescription>
          </div>
          <Button asChild size="sm" variant="outline">
            <a href={`/admin/fiscal/books/export?kind=purchases&month=${month}`}>Descargar CSV</a>
          </Button>
        </div>
        {purchases.rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No hay compras registradas este mes.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-muted-foreground">
                <tr>
                  <th className={head}>Fecha</th>
                  <th className={head}>Proveedor</th>
                  <th className={head}>N.º / Control</th>
                  <th className={`${head} text-right`}>Total</th>
                  <th className={`${head} text-right`}>Base</th>
                  <th className={`${head} text-right`}>IVA</th>
                  <th className={head} />
                </tr>
              </thead>
              <tbody className="divide-y">
                {purchases.rows.map((row) => (
                  <tr key={row.id}>
                    <td className="py-1 pr-2">{row.date}</td>
                    <td className="py-1 pr-2">
                      {row.supplierName} · {row.supplierRif}
                    </td>
                    <td className="py-1 pr-2">
                      {row.invoiceNumber} / {row.controlNumber}
                    </td>
                    <td className={num}>{row.total}</td>
                    <td className={num}>{row.base}</td>
                    <td className={num}>{row.vat}</td>
                    <td className="py-1">
                      <ActionForm action={deletePurchase} hidden={{ purchaseId: row.id }}>
                        <SubmitButton size="sm" variant="ghost">
                          Borrar
                        </SubmitButton>
                      </ActionForm>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <details className="text-sm">
          <summary className="cursor-pointer font-medium">Registrar una factura de compra</summary>
          <ActionForm action={createPurchase} resetOnSuccess className="mt-3">
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Fecha" htmlFor="date">
                <Input
                  id="date"
                  name="date"
                  type="date"
                  defaultValue={today}
                  max={today}
                  required
                />
              </Field>
              <Field label="RIF del proveedor" htmlFor="supplierRif">
                <Input id="supplierRif" name="supplierRif" placeholder="J-12345678-9" required />
              </Field>
              <Field label="Proveedor" htmlFor="supplierName">
                <Input id="supplierName" name="supplierName" required />
              </Field>
              <Field label="N.º de factura" htmlFor="invoiceNumber">
                <Input id="invoiceNumber" name="invoiceNumber" required />
              </Field>
              <Field label="N.º de control" htmlFor="controlNumber">
                <Input id="controlNumber" name="controlNumber" required />
              </Field>
              <Field label="Base imponible (Bs)" htmlFor="base">
                <Input id="base" name="base" inputMode="decimal" defaultValue="0.00" />
              </Field>
              <Field label="Exento (Bs)" htmlFor="exempt">
                <Input id="exempt" name="exempt" inputMode="decimal" defaultValue="0.00" />
              </Field>
              <Field label="Alícuota IVA (%)" htmlFor="vatRate">
                <Input id="vatRate" name="vatRate" inputMode="decimal" defaultValue="16.00" />
              </Field>
              <Field label="IVA (Bs)" htmlFor="vat">
                <Input id="vat" name="vat" inputMode="decimal" defaultValue="0.00" />
              </Field>
            </div>
            <div>
              <SubmitButton>Registrar compra</SubmitButton>
            </div>
          </ActionForm>
        </details>
      </Card>
    </>
  );
}
