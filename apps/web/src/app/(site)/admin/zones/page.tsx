import {
  CURRENCIES,
  ZONE_STATUS_LABELS,
  ZONE_STATUSES,
  type OperatingZone,
  type ZoneStatus,
} from '@vtp/shared-types';
import type { Metadata } from 'next';
import Link from 'next/link';
import { ActionForm, SubmitButton } from '@/components/portal/action-form';
import { Badge } from '@/components/ui/badge';
import { Card, CardDescription, CardTitle } from '@/components/ui/card';
import { Input, Select } from '@/components/ui/input';
import { Field } from '@/components/ui/label';
import { apiFetch } from '@/lib/server/api';
import { requirePlatformAdmin } from '@/lib/server/session';
import { createZone, setZoneStatus, updateZone } from './actions';

export const metadata: Metadata = { title: 'Zonas operativas' };

const STATUS_VARIANT: Record<ZoneStatus, 'success' | 'secondary' | 'outline'> = {
  active: 'success',
  coming_soon: 'secondary',
  paused: 'outline',
};

/** What each switch button does, in the admin's words. */
const SWITCH: Record<ZoneStatus, string> = {
  active: 'Activar',
  coming_soon: 'Marcar como próximamente',
  paused: 'Pausar',
};

export default async function ZonesPage() {
  await requirePlatformAdmin();
  const zones = await apiFetch<OperatingZone[]>('/admin/zones');

  return (
    <>
      <div className="flex flex-col gap-2">
        <Link href="/admin" className="text-sm text-muted-foreground hover:underline">
          ← Administración
        </Link>
        <h1 className="text-2xl font-semibold">Zonas operativas</h1>
        <p className="text-sm text-muted-foreground">
          Ciudades o regiones donde opera la plataforma, todas en la misma base de datos. Solo las
          zonas <strong>activas</strong> venden pasajes y taxis; las que están <em>próximamente</em>{' '}
          se muestran pero no venden, y las <em>pausadas</em> se ocultan. Las paradas nuevas entran
          solas en la zona cuyo radio las contiene. La comisión de una zona se aplica a los viajes
          que suben en ella, salvo que la empresa tenga la suya.
        </p>
      </div>

      <Card>
        <CardTitle>Nueva zona</CardTitle>
        <ActionForm action={createZone} resetOnSuccess>
          <ZoneFields />
          <Field label="Estado inicial" htmlFor="status">
            <Select id="status" name="status" defaultValue="coming_soon">
              {ZONE_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {ZONE_STATUS_LABELS[status]}
                </option>
              ))}
            </Select>
          </Field>
          <div>
            <SubmitButton>Crear zona</SubmitButton>
          </div>
        </ActionForm>
      </Card>

      {zones.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Todavía no hay zonas. Sin zonas, todas las paradas venden como hasta ahora.
        </p>
      ) : (
        zones.map((zone) => (
          <Card key={zone.id}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex flex-col gap-1">
                <div className="flex flex-wrap items-center gap-2">
                  <CardTitle>{zone.name}</CardTitle>
                  <Badge variant={STATUS_VARIANT[zone.status]}>
                    {ZONE_STATUS_LABELS[zone.status]}
                  </Badge>
                </div>
                <CardDescription>
                  {zone.stopCount ?? 0} paradas · moneda {zone.defaultCurrency} · comisión{' '}
                  {zone.commissionRate ? `${zone.commissionRate} %` : 'de la plataforma'}
                  {zone.radiusKm ? ` · radio ${zone.radiusKm} km` : ' · sin área'}
                </CardDescription>
              </div>
              <div className="flex flex-wrap gap-2">
                {ZONE_STATUSES.filter((status) => status !== zone.status).map((status) => (
                  <ActionForm
                    key={status}
                    action={setZoneStatus}
                    hidden={{ zoneId: zone.id, status }}
                  >
                    <SubmitButton size="sm" variant={status === 'active' ? 'default' : 'outline'}>
                      {SWITCH[status]}
                    </SubmitButton>
                  </ActionForm>
                ))}
              </div>
            </div>
            <details>
              <summary className="cursor-pointer text-sm text-muted-foreground">Editar</summary>
              <ActionForm action={updateZone} hidden={{ zoneId: zone.id }}>
                <ZoneFields zone={zone} />
                <div>
                  <SubmitButton variant="outline">Guardar</SubmitButton>
                </div>
              </ActionForm>
            </details>
          </Card>
        ))
      )}
    </>
  );
}

function ZoneFields({ zone }: { zone?: OperatingZone }) {
  const id = (name: string) => (zone ? `${name}-${zone.id}` : name);
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="Nombre" htmlFor={id('name')}>
        <Input
          id={id('name')}
          name="name"
          required
          defaultValue={zone?.name}
          placeholder="Eje Casacoima – San Félix"
        />
      </Field>
      <Field label="Identificador" htmlFor={id('slug')} hint="Minúsculas y guiones: san-felix">
        <Input id={id('slug')} name="slug" required defaultValue={zone?.slug} />
      </Field>
      <Field
        label="Moneda de las tarifas"
        htmlFor={id('defaultCurrency')}
        hint="La que se propone al cargar tarifas en esta zona"
      >
        <Select
          id={id('defaultCurrency')}
          name="defaultCurrency"
          defaultValue={zone?.defaultCurrency ?? 'USD'}
        >
          {CURRENCIES.map((currency) => (
            <option key={currency} value={currency}>
              {currency}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Comisión (%)" htmlFor={id('commissionRate')} hint="Vacía: la de la plataforma">
        <Input
          id={id('commissionRate')}
          name="commissionRate"
          inputMode="decimal"
          defaultValue={zone?.commissionRate ?? ''}
        />
      </Field>
      <div className="grid grid-cols-3 gap-2 sm:col-span-2">
        <Field label="Latitud del centro" htmlFor={id('latitude')}>
          <Input
            id={id('latitude')}
            name="latitude"
            inputMode="decimal"
            defaultValue={zone?.latitude ?? ''}
          />
        </Field>
        <Field label="Longitud del centro" htmlFor={id('longitude')}>
          <Input
            id={id('longitude')}
            name="longitude"
            inputMode="decimal"
            defaultValue={zone?.longitude ?? ''}
          />
        </Field>
        <Field label="Radio (km)" htmlFor={id('radiusKm')}>
          <Input
            id={id('radiusKm')}
            name="radiusKm"
            inputMode="numeric"
            defaultValue={zone?.radiusKm ?? ''}
          />
        </Field>
      </div>
    </div>
  );
}
