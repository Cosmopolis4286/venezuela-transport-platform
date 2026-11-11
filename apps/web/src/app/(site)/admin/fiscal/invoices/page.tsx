import {
  BUYER_ID_TYPES,
  formatPaymentAmount,
  INVOICE_STATUS_LABELS,
  INVOICE_STATUSES,
  todayInVenezuela,
  type Invoice,
  type InvoiceReason,
  type InvoiceStatus,
} from '@vtp/shared-types';
import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import { ActionForm, SubmitButton } from '@/components/portal/action-form';
import { Badge } from '@/components/ui/badge';
import { Card, CardDescription, CardTitle } from '@/components/ui/card';
import { Input, Select } from '@/components/ui/input';
import { Field } from '@/components/ui/label';
import { formatDate } from '@/lib/labels';
import { apiFetch } from '@/lib/server/api';
import { requirePlatformAdmin } from '@/lib/server/session';
import { issueInvoice, updateInvoiceBuyer, voidInvoice } from '../actions';

export const metadata: Metadata = { title: 'Facturas' };

const REASON: Record<InvoiceReason, string> = {
  service_fee: 'Tarifa por servicio',
  fee_refund: 'Nota de crédito: devolución de la tarifa',
  operator_cancellation: 'Tarifa asumida por la empresa (salida cancelada)',
};

const VARIANT: Record<InvoiceStatus, 'secondary' | 'success' | 'outline'> = {
  draft: 'secondary',
  issued: 'success',
  voided: 'outline',
};

export default function InvoicesPage({ searchParams }: PageProps<'/admin/fiscal/invoices'>) {
  return (
    <Suspense fallback={<p className="text-muted-foreground">Cargando…</p>}>
      <Invoices searchParams={searchParams} />
    </Suspense>
  );
}

async function Invoices({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requirePlatformAdmin();
  const query = await searchParams;
  const status = INVOICE_STATUSES.find((s) => s === query.status) ?? 'draft';
  const invoices = await apiFetch<Invoice[]>(`/admin/fiscal/invoices?status=${status}`);
  const today = todayInVenezuela();

  return (
    <>
      <div className="flex flex-col gap-2">
        <Link href="/admin/fiscal" className="text-sm text-muted-foreground hover:underline">
          ← Facturación
        </Link>
        <h1 className="text-2xl font-semibold">Facturas y notas de crédito</h1>
        <p className="text-sm text-muted-foreground">
          Para emitir un borrador: créalo en el portal del SENIAT con estos datos y anota aquí el
          número de factura, el número de control y la fecha. Una nota de crédito se emite después
          de su factura. Si el SENIAT anuló un documento, anúlalo también aquí.
        </p>
        <nav className="flex gap-3 text-sm">
          {INVOICE_STATUSES.map((s) => (
            <Link
              key={s}
              href={`/admin/fiscal/invoices?status=${s}`}
              className={s === status ? 'font-semibold underline' : 'hover:underline'}
            >
              {INVOICE_STATUS_LABELS[s]}
            </Link>
          ))}
        </nav>
      </div>

      {invoices.length === 0 ? (
        <p className="text-sm text-muted-foreground">No hay documentos en este estado.</p>
      ) : (
        invoices.map((invoice) => (
          <Card key={invoice.id}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex flex-col gap-1">
                <CardTitle>
                  {invoice.kind === 'credit_note' ? 'Nota de crédito' : 'Factura'}
                  {invoice.number ? ` N.º ${invoice.number}` : ''} ·{' '}
                  {formatPaymentAmount(invoice.amount, invoice.currency)}
                </CardTitle>
                <CardDescription>
                  {REASON[invoice.reason]} · reserva {invoice.bookingCode} · creada{' '}
                  {formatDate(invoice.createdAt)}
                  {invoice.relatedInvoice
                    ? ` · corrige la factura ${invoice.relatedInvoice.number ?? '(sin emitir)'}`
                    : ''}
                </CardDescription>
              </div>
              <Badge variant={VARIANT[invoice.status]}>
                {INVOICE_STATUS_LABELS[invoice.status]}
              </Badge>
            </div>
            <dl className="grid gap-1 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-muted-foreground">Comprador</dt>
                <dd>
                  {invoice.buyer.name} · {invoice.buyer.idType}-{invoice.buyer.idNumber}
                  {invoice.buyer.address ? ` · ${invoice.buyer.address}` : ''}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Concepto</dt>
                <dd>{invoice.description}</dd>
              </div>
              {invoice.amountsVes ? (
                <div className="sm:col-span-2">
                  <dt className="text-muted-foreground">
                    Emitida el {invoice.issuedOn} · control {invoice.controlNumber} · tasa{' '}
                    {invoice.exchangeRate}
                  </dt>
                  <dd className="tabular-nums">
                    Base Bs {invoice.amountsVes.base} · No gravado Bs {invoice.amountsVes.notTaxed}{' '}
                    · IVA {invoice.amountsVes.vatRate}% Bs {invoice.amountsVes.vat} · Total Bs{' '}
                    {invoice.amountsVes.total}
                  </dd>
                </div>
              ) : null}
              {invoice.voidReason ? (
                <div className="sm:col-span-2">
                  <dt className="text-muted-foreground">Motivo de anulación</dt>
                  <dd>{invoice.voidReason}</dd>
                </div>
              ) : null}
            </dl>

            {invoice.status === 'draft' ? (
              <>
                <ActionForm
                  action={issueInvoice}
                  hidden={{ invoiceId: invoice.id }}
                  className="sm:flex-row sm:flex-wrap sm:items-end"
                >
                  <Field label="N.º de factura" htmlFor={`number-${invoice.id}`}>
                    <Input id={`number-${invoice.id}`} name="number" required />
                  </Field>
                  <Field label="N.º de control" htmlFor={`control-${invoice.id}`}>
                    <Input id={`control-${invoice.id}`} name="controlNumber" required />
                  </Field>
                  <Field label="Fecha de emisión" htmlFor={`date-${invoice.id}`}>
                    <Input
                      id={`date-${invoice.id}`}
                      name="issuedOn"
                      type="date"
                      defaultValue={today}
                      max={today}
                    />
                  </Field>
                  <div>
                    <SubmitButton>Emitir</SubmitButton>
                  </div>
                </ActionForm>
                <details className="text-sm">
                  <summary className="cursor-pointer text-muted-foreground">
                    Cambiar comprador (si pidió la factura a otro nombre)
                  </summary>
                  <ActionForm
                    action={updateInvoiceBuyer}
                    hidden={{ invoiceId: invoice.id }}
                    className="mt-3"
                  >
                    <div className="grid gap-3 sm:grid-cols-3">
                      <Field label="Nombre o razón social" htmlFor={`name-${invoice.id}`}>
                        <Input
                          id={`name-${invoice.id}`}
                          name="name"
                          defaultValue={invoice.buyer.name}
                          required
                        />
                      </Field>
                      <Field label="Tipo" htmlFor={`idType-${invoice.id}`}>
                        <Select
                          id={`idType-${invoice.id}`}
                          name="idType"
                          defaultValue={invoice.buyer.idType}
                        >
                          {BUYER_ID_TYPES.map((t) => (
                            <option key={t} value={t}>
                              {t}
                            </option>
                          ))}
                        </Select>
                      </Field>
                      <Field label="Cédula o RIF" htmlFor={`idNumber-${invoice.id}`}>
                        <Input
                          id={`idNumber-${invoice.id}`}
                          name="idNumber"
                          defaultValue={invoice.buyer.idNumber}
                          required
                        />
                      </Field>
                    </div>
                    <Field label="Domicilio fiscal (opcional)" htmlFor={`address-${invoice.id}`}>
                      <Input
                        id={`address-${invoice.id}`}
                        name="address"
                        defaultValue={invoice.buyer.address ?? ''}
                      />
                    </Field>
                    <div>
                      <SubmitButton variant="outline">Guardar comprador</SubmitButton>
                    </div>
                  </ActionForm>
                </details>
              </>
            ) : null}

            {invoice.status !== 'voided' ? (
              <details className="text-sm">
                <summary className="cursor-pointer text-muted-foreground">Anular</summary>
                <ActionForm
                  action={voidInvoice}
                  hidden={{ invoiceId: invoice.id }}
                  className="mt-3 sm:flex-row sm:items-end"
                >
                  <Field label="Motivo" htmlFor={`reason-${invoice.id}`}>
                    <Input id={`reason-${invoice.id}`} name="reason" required minLength={3} />
                  </Field>
                  <div>
                    <SubmitButton variant="destructive">Anular documento</SubmitButton>
                  </div>
                </ActionForm>
              </details>
            ) : null}
          </Card>
        ))
      )}
    </>
  );
}
