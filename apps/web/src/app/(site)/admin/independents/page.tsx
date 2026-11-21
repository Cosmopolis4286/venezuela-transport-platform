import {
  DRIVER_RATING_MIN_COUNT,
  DRIVER_RATING_SUSPEND_BELOW,
  DRIVER_RATING_WINDOW,
  localPhone,
  type DriverSuspension,
  type IndependentLine,
} from '@vtp/shared-types';
import type { Metadata } from 'next';
import Link from 'next/link';
import { ActionForm, SubmitButton } from '@/components/portal/action-form';
import { Badge } from '@/components/ui/badge';
import { Card, CardDescription, CardTitle } from '@/components/ui/card';
import { Input, Select, Textarea } from '@/components/ui/input';
import { Field } from '@/components/ui/label';
import { apiFetch } from '@/lib/server/api';
import { requirePlatformPermission } from '@/lib/server/session';
import { formatDate } from '@/lib/labels';
import { createIndependentLine, liftDriverSuspension } from './actions';

export const metadata: Metadata = { title: 'Conductores independientes' };

/**
 * The lines the platform runs for taxi and motorcycle drivers who belong to no line (ADR-039).
 * Each line is managed from the portal like any other; this page creates them and shows totals.
 */
export default async function IndependentsPage() {
  await requirePlatformPermission('independents.manage');
  const [lines, suspensions] = await Promise.all([
    apiFetch<IndependentLine[]>('/admin/independent-lines'),
    apiFetch<DriverSuspension[]>('/admin/driver-suspensions'),
  ]);
  const active = suspensions.filter((s) => !s.liftedAt);
  return (
    <>
      <div className="flex flex-col gap-2">
        <Link href="/admin" className="text-sm text-muted-foreground hover:underline">
          ← Administración
        </Link>
        <h1 className="text-2xl font-semibold">Conductores independientes</h1>
        <p className="text-sm text-muted-foreground">
          Los taxistas y mototaxistas que trabajan por su cuenta «conducen con VTP», como en las
          apps de viajes: en la app de transportistas eligen carro o moto, envían su KYC con su
          propio vehículo y, al aprobarlo, entran solos a la línea de VTP de ese vehículo. Nunca ven
          una «línea» ni eligen empresa; los pasajeros ven el nombre comercial (VTP). Hay una línea
          por tipo de vehículo, y cada una se administra desde el portal: tarifas por tramo,
          terminales, despacho, equipo y liquidación.
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
        <CardTitle>Suspendidos por calificación · {active.length}</CardTitle>
        <CardDescription>
          Con al menos {DRIVER_RATING_MIN_COUNT} calificaciones, si el promedio de las últimas{' '}
          {DRIVER_RATING_WINDOW} baja de {DRIVER_RATING_SUSPEND_BELOW.toFixed(1)}, el conductor
          queda suspendido y desconectado (ADR-044). Revisa los comentarios, habla con la persona y,
          si corresponde, levanta la suspensión escribiendo qué acordaron: lo ve el conductor, y su
          promedio vuelve a contar desde cero.
        </CardDescription>
        {suspensions.length === 0 ? (
          <p className="text-sm text-muted-foreground">Ningún conductor ha sido suspendido.</p>
        ) : (
          <ul className="flex flex-col divide-y">
            {suspensions.map((suspension) => (
              <li key={suspension.id} className="flex flex-col gap-2 py-4">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-medium">{suspension.driver.name}</p>
                  <Badge variant={suspension.liftedAt ? 'secondary' : 'destructive'}>
                    {suspension.liftedAt ? 'Levantada' : 'Suspendido'}
                  </Badge>
                  <span className="text-sm text-muted-foreground">
                    {suspension.line.name} · promedio{' '}
                    {suspension.average?.toLocaleString('es-VE') ?? '—'} en {suspension.ratings}{' '}
                    viajes · desde {formatDate(suspension.createdAt)}
                    {suspension.driver.phone ? ` · ${localPhone(suspension.driver.phone)}` : ''}
                  </span>
                </div>
                {suspension.comments.length ? (
                  <ul className="list-disc pl-5 text-sm text-muted-foreground">
                    {suspension.comments.map((c) => (
                      <li key={c.ratedAt}>
                        {'★'.repeat(c.rating)} «{c.comment}» · {formatDate(c.ratedAt)}
                      </li>
                    ))}
                  </ul>
                ) : null}
                {suspension.liftedAt ? (
                  <p className="text-sm">
                    Levantada {formatDate(suspension.liftedAt)}: {suspension.liftNotes}
                  </p>
                ) : (
                  <ActionForm
                    action={liftDriverSuspension}
                    hidden={{ suspensionId: suspension.id }}
                  >
                    <Textarea
                      name="notes"
                      required
                      minLength={3}
                      placeholder="Qué revisaste o acordaste con el conductor (lo verá)"
                    />
                    <div>
                      <SubmitButton size="sm">Levantar la suspensión</SubmitButton>
                    </div>
                  </ActionForm>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <CardTitle>Nueva línea de independientes</CardTitle>
        <CardDescription>
          Una por tipo de vehículo (taxis y motos). Queda activa al crearla y tú como su dueña o
          dueño. El nombre comercial es lo que ven pasajeros y conductores. Cada organización
          necesita su propio RIF.
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
            <Field
              label="Nombre comercial (lo que ven pasajeros y conductores)"
              htmlFor="tradeName"
            >
              <Input id="tradeName" name="tradeName" defaultValue="VTP" />
            </Field>
          </div>
          <SubmitButton>Crear línea</SubmitButton>
        </ActionForm>
      </Card>
    </>
  );
}
