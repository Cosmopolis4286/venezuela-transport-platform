import {
  TAXPAYER_TYPE_LABELS,
  TAXPAYER_TYPES,
  todayInVenezuela,
  type BcvRate,
  type FiscalSettings,
} from '@vtp/shared-types';
import type { Metadata } from 'next';
import Link from 'next/link';
import { ActionForm, SubmitButton } from '@/components/portal/action-form';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardTitle } from '@/components/ui/card';
import { Input, Select } from '@/components/ui/input';
import { Field } from '@/components/ui/label';
import { apiFetch } from '@/lib/server/api';
import { requirePlatformAdmin } from '@/lib/server/session';
import { saveBcvRate, saveFiscalSettings } from './actions';

export const metadata: Metadata = { title: 'Facturación' };

export default async function FiscalPage() {
  await requirePlatformAdmin();
  const [settings, rates] = await Promise.all([
    apiFetch<FiscalSettings>('/admin/fiscal/settings'),
    apiFetch<BcvRate[]>('/admin/fiscal/bcv-rates'),
  ]);

  return (
    <>
      <div className="flex flex-col gap-2">
        <Link href="/admin" className="text-sm text-muted-foreground hover:underline">
          ← Administración
        </Link>
        <h1 className="text-2xl font-semibold">Facturación</h1>
        <p className="text-sm text-muted-foreground">
          La plataforma factura solo su tarifa por servicio (el IVA va incluido); el pasaje lo
          factura cada empresa. Cada pago crea un borrador de factura. Se emite en el portal del
          SENIAT y aquí se anotan su número y número de control. Los montos se pasan a bolívares con
          la tasa BCV del día de emisión. Tu contador debe validar la tasa de IVA y el formato de
          los libros.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button asChild size="sm">
            <Link href="/admin/fiscal/invoices">Facturas por emitir</Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link href="/admin/fiscal/books">Libros de ventas y compras</Link>
          </Button>
        </div>
      </div>

      <Card>
        <div className="flex flex-col gap-1">
          <CardTitle>Datos fiscales del emisor</CardTitle>
          <CardDescription>
            Los que aparecen en tu RIF (firma personal o empresa).{' '}
            {settings.issuer === 'draft' ? (
              <Badge variant="secondary">Modo borrador: se emite en el portal del SENIAT</Badge>
            ) : (
              <Badge variant="success">Imprenta digital autorizada</Badge>
            )}
          </CardDescription>
        </div>
        {settings.complete ? null : (
          <Alert variant="destructive">
            Completa la razón social, el RIF y el domicilio fiscal para poder emitir.
          </Alert>
        )}
        <ActionForm action={saveFiscalSettings}>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Razón social o nombre" htmlFor="legalName">
              <Input id="legalName" name="legalName" defaultValue={settings.legalName} required />
            </Field>
            <Field label="RIF" htmlFor="rif">
              <Input
                id="rif"
                name="rif"
                defaultValue={settings.rif}
                placeholder="V-12345678-9"
                required
              />
            </Field>
          </div>
          <Field label="Domicilio fiscal" htmlFor="fiscalAddress">
            <Input
              id="fiscalAddress"
              name="fiscalAddress"
              defaultValue={settings.fiscalAddress}
              required
            />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Tipo de contribuyente" htmlFor="taxpayerType">
              <Select id="taxpayerType" name="taxpayerType" defaultValue={settings.taxpayerType}>
                {TAXPAYER_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {TAXPAYER_TYPE_LABELS[type]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="IVA incluido en la tarifa (%)" htmlFor="vatRate">
              <Input
                id="vatRate"
                name="vatRate"
                inputMode="decimal"
                defaultValue={settings.vatRate}
                required
              />
            </Field>
          </div>
          <p className="text-sm text-muted-foreground">
            Un contribuyente formal no cobra IVA: sus ventas se registran como no gravadas.
          </p>
          <div>
            <SubmitButton>Guardar datos fiscales</SubmitButton>
          </div>
        </ActionForm>
      </Card>

      <Card>
        <div className="flex flex-col gap-1">
          <CardTitle>Tasa oficial BCV</CardTitle>
          <CardDescription>
            Bolívares por dólar. Para emitir se usa la tasa del día de emisión o, si falta, la del
            último día anterior que tenga tasa.
          </CardDescription>
        </div>
        <ActionForm action={saveBcvRate} className="sm:flex-row sm:items-end">
          <Field label="Fecha" htmlFor="date">
            <Input
              id="date"
              name="date"
              type="date"
              defaultValue={todayInVenezuela()}
              max={todayInVenezuela()}
              required
            />
          </Field>
          <Field label="Bs por USD" htmlFor="unitsPerUsd">
            <Input id="unitsPerUsd" name="unitsPerUsd" inputMode="decimal" required />
          </Field>
          <div>
            <SubmitButton>Guardar tasa</SubmitButton>
          </div>
        </ActionForm>
        {rates.length === 0 ? (
          <p className="text-sm text-muted-foreground">Todavía no hay tasas registradas.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-left text-muted-foreground">
              <tr>
                <th className="py-1 font-medium">Fecha</th>
                <th className="py-1 text-right font-medium">Bs por USD</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rates.slice(0, 15).map((rate) => (
                <tr key={rate.date}>
                  <td className="py-1">{rate.date}</td>
                  <td className="py-1 text-right tabular-nums">{rate.unitsPerUsd}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </>
  );
}
