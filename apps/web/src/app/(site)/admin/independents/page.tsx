import type { IndependentLine } from '@vtp/shared-types';
import type { Metadata } from 'next';
import Link from 'next/link';
import { ActionForm, SubmitButton } from '@/components/portal/action-form';
import { Badge } from '@/components/ui/badge';
import { Card, CardDescription, CardTitle } from '@/components/ui/card';
import { Input, Select } from '@/components/ui/input';
import { Field } from '@/components/ui/label';
import { apiFetch } from '@/lib/server/api';
import { requirePlatformPermission } from '@/lib/server/session';
import { createIndependentLine } from './actions';

export const metadata: Metadata = { title: 'Conductores independientes' };

/**
 * The lines the platform runs for taxi and motorcycle drivers who belong to no line (ADR-039).
 * Each line is managed from the portal like any other; this page creates them and shows totals.
 */
export default async function IndependentsPage() {
  await requirePlatformPermission('independents.manage');
  const lines = await apiFetch<IndependentLine[]>('/admin/independent-lines');
  return (
    <>
      <div className="flex flex-col gap-2">
        <Link href="/admin" className="text-sm text-muted-foreground hover:underline">
          ← Administración
        </Link>
        <h1 className="text-2xl font-semibold">Conductores independientes</h1>
        <p className="text-sm text-muted-foreground">
          Los taxistas y mototaxistas que no pertenecen a una línea trabajan en una línea operada
          por la plataforma. Envían su KYC eligiéndola, con su propio vehículo; al aprobarlo entran
          solos como conductores, y su vehículo queda en la flota marcado como suyo (solo ellos lo
          usan). Cada línea se administra desde el portal: tarifas por tramo, terminales, despacho,
          equipo y liquidación.
        </p>
      </div>

      {lines.length === 0 ? (
        <p className="text-sm text-muted-foreground">Todavía no hay líneas de independientes.</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {lines.map(({ organization, drivers, vehicles, pendingApplications }) => (
            <Card key={organization.id}>
              <div className="flex flex-wrap items-center gap-2">
                <CardTitle>{organization.tradeName ?? organization.legalName}</CardTitle>
                <Badge variant="outline">
                  {organization.type === 'moto_line' ? 'Mototaxis' : 'Taxis'}
                </Badge>
              </div>
              <CardDescription>
                {drivers} conductores · {vehicles} vehículos activos · {pendingApplications}{' '}
                solicitudes en revisión
              </CardDescription>
              <div className="flex flex-wrap gap-4 text-sm">
                <Link href={`/portal/organizations/${organization.id}`} className="hover:underline">
                  Administrar en el portal →
                </Link>
                <Link href="/admin" className="hover:underline">
                  Revisar solicitudes KYC
                </Link>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Card>
        <CardTitle>Nueva línea de independientes</CardTitle>
        <CardDescription>
          Queda activa al crearla y tú como su dueña o dueño. Cada organización necesita su propio
          RIF.
        </CardDescription>
        <ActionForm action={createIndependentLine} resetOnSuccess>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Tipo" htmlFor="type">
              <Select id="type" name="type" defaultValue="moto_line">
                <option value="moto_line">Mototaxis</option>
                <option value="taxi_line">Taxis</option>
              </Select>
            </Field>
            <Field label="RIF" htmlFor="rif">
              <Input id="rif" name="rif" required placeholder="J-12345678-9" />
            </Field>
            <Field label="Razón social" htmlFor="legalName">
              <Input
                id="legalName"
                name="legalName"
                required
                placeholder="VTP Conductores Independientes – Mototaxis"
              />
            </Field>
            <Field label="Nombre comercial (opcional)" htmlFor="tradeName">
              <Input id="tradeName" name="tradeName" placeholder="VTP Mototaxis" />
            </Field>
          </div>
          <SubmitButton>Crear línea</SubmitButton>
        </ActionForm>
      </Card>
    </>
  );
}
