import { STOP_KIND_LABELS, STOP_KINDS, type Stop } from '@vtp/shared-types';
import Link from 'next/link';
import { ActionForm, SubmitButton } from '@/components/portal/action-form';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardTitle } from '@/components/ui/card';
import { Input, Select } from '@/components/ui/input';
import { Field } from '@/components/ui/label';
import { apiFetch } from '@/lib/server/api';
import { createStop, setStopActive } from '../actions';

export default async function StopsPage({ searchParams }: PageProps<'/admin/stops'>) {
  const { q } = await searchParams;
  const query = typeof q === 'string' ? q : '';
  const stops = await apiFetch<Stop[]>(
    `/admin/stops${query ? `?q=${encodeURIComponent(query)}` : ''}`,
  );

  return (
    <>
      <div className="flex flex-col gap-2">
        <Link href="/admin" className="text-sm text-muted-foreground hover:underline">
          ← Revisiones pendientes
        </Link>
        <h1 className="text-2xl font-semibold">Terminales y paradas</h1>
        <p className="text-sm text-muted-foreground">
          Catálogo común sobre el que las empresas arman sus rutas. Las paradas inactivas no
          aparecen en la búsqueda ni pueden agregarse a rutas nuevas.
        </p>
      </div>

      <Card>
        <CardTitle>Agregar</CardTitle>
        <ActionForm action={createStop} resetOnSuccess>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Tipo" htmlFor="kind">
              <Select id="kind" name="kind" defaultValue="terminal">
                {STOP_KINDS.map((kind) => (
                  <option key={kind} value={kind}>
                    {STOP_KIND_LABELS[kind]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Nombre" htmlFor="name">
              <Input id="name" name="name" required placeholder="Terminal La Bandera" />
            </Field>
            <Field label="Ciudad" htmlFor="city">
              <Input id="city" name="city" required placeholder="Caracas" />
            </Field>
            <Field label="Estado" htmlFor="state">
              <Input id="state" name="state" required placeholder="Distrito Capital" />
            </Field>
            <Field label="Dirección (opcional)" htmlFor="address">
              <Input id="address" name="address" />
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Latitud" htmlFor="latitude" hint="Opcional, p. ej. 10.4806">
                <Input id="latitude" name="latitude" inputMode="decimal" />
              </Field>
              <Field label="Longitud" htmlFor="longitude" hint="Opcional, p. ej. -66.9036">
                <Input id="longitude" name="longitude" inputMode="decimal" />
              </Field>
            </div>
          </div>
          <div>
            <SubmitButton>Agregar al catálogo</SubmitButton>
          </div>
        </ActionForm>
      </Card>

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-col gap-1">
            <CardTitle>Catálogo · {stops.length}</CardTitle>
            <CardDescription>Ordenado por estado y ciudad.</CardDescription>
          </div>
          <form className="flex gap-2" role="search">
            <Input name="q" defaultValue={query} placeholder="Buscar por nombre o ciudad" />
            <Button type="submit" variant="outline">
              Buscar
            </Button>
          </form>
        </div>
        {stops.length === 0 ? (
          <p className="text-sm text-muted-foreground">No hay paradas que coincidan.</p>
        ) : (
          <ul className="flex flex-col divide-y">
            {stops.map((stop) => (
              <li key={stop.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium">{stop.name}</p>
                    <Badge variant="outline">{STOP_KIND_LABELS[stop.kind]}</Badge>
                    {stop.active ? null : <Badge variant="secondary">Inactiva</Badge>}
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {stop.city}, {stop.state}
                    {stop.address ? ` · ${stop.address}` : ''}
                    {stop.latitude !== null ? ` · ${stop.latitude}, ${stop.longitude}` : ''}
                  </p>
                </div>
                <ActionForm
                  action={setStopActive}
                  hidden={{ stopId: stop.id, active: String(!stop.active) }}
                >
                  <SubmitButton size="sm" variant="outline">
                    {stop.active ? 'Desactivar' : 'Activar'}
                  </SubmitButton>
                </ActionForm>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
