import type { ServiceArea, ServicesSettings, Stop } from '@vtp/shared-types';
import Link from 'next/link';
import { ActionForm, SubmitButton } from '@/components/portal/action-form';
import { Badge } from '@/components/ui/badge';
import { Card, CardDescription, CardTitle } from '@/components/ui/card';
import { Input, Select } from '@/components/ui/input';
import { Field } from '@/components/ui/label';
import { apiFetch } from '@/lib/server/api';
import { getCurrentUser } from '@/lib/server/session';
import { createServiceArea, saveIntercity, updateServiceArea } from '../actions';

/**
 * The intercity and suburban services (ADR-029). Reviewers curate corridors; only admins switch
 * sales on or off. Switching off only stops sales: sold tickets and trip packs keep working.
 */
export default async function ServicesPage() {
  const user = await getCurrentUser();
  const isAdmin = user.platformRole === 'admin';
  const [stops, areas, settings] = await Promise.all([
    apiFetch<Stop[]>('/admin/stops'),
    apiFetch<ServiceArea[]>('/service-areas'),
    isAdmin ? apiFetch<ServicesSettings>('/admin/services') : Promise.resolve(null),
  ]);
  const active = stops.filter((s) => s.active);

  return (
    <>
      <div className="flex flex-col gap-2">
        <Link href="/admin" className="text-sm text-muted-foreground hover:underline">
          ← Revisiones pendientes
        </Link>
        <h1 className="text-2xl font-semibold">Servicios</h1>
        <p className="text-sm text-muted-foreground">
          Qué se vende: el servicio entre ciudades y cada corredor suburbano. Apagar uno solo
          detiene la venta; los boletos pagados y los paquetes siguen valiendo, y las empresas
          siguen operando. Siempre debe quedar algo encendido.
        </p>
      </div>

      {settings ? <IntercityCard settings={settings} stops={active} /> : null}

      <Card>
        <CardTitle>Corredores suburbanos · {areas.length}</CardTitle>
        <CardDescription>
          Un corredor agrupa las paradas de un servicio suburbano (por ejemplo, Casacoima – San
          Félix – Puerto Ordaz). Las rutas suburbanas solo usan paradas de su corredor. Un corredor
          nuevo empieza apagado.
        </CardDescription>
        {areas.length === 0 ? (
          <p className="text-sm text-muted-foreground">Todavía no hay corredores.</p>
        ) : (
          <ul className="flex flex-col divide-y">
            {areas.map((area) => (
              <li key={area.id} className="flex flex-col gap-3 py-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium">{area.name}</p>
                    <Badge variant={area.active ? 'default' : 'secondary'}>
                      {area.active ? 'Encendido' : 'Apagado'}
                    </Badge>
                  </div>
                  {isAdmin ? (
                    <ActionForm
                      action={updateServiceArea}
                      hidden={{ areaId: area.id, active: String(!area.active) }}
                    >
                      <SubmitButton size="sm" variant="outline">
                        {area.active ? 'Apagar' : 'Encender'}
                      </SubmitButton>
                    </ActionForm>
                  ) : null}
                </div>
                <details>
                  <summary className="cursor-pointer text-sm text-muted-foreground">
                    {area.stops.length} paradas:{' '}
                    {[...new Set(area.stops.map((s) => s.city))].join(', ')} · Editar
                  </summary>
                  <ActionForm action={updateServiceArea} hidden={{ areaId: area.id }}>
                    <AreaFields
                      stops={active}
                      name={area.name}
                      selected={area.stops.map((s) => s.id)}
                      id={area.id}
                    />
                    <div>
                      <SubmitButton size="sm">Guardar corredor</SubmitButton>
                    </div>
                  </ActionForm>
                </details>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <CardTitle>Nuevo corredor</CardTitle>
        <ActionForm action={createServiceArea} resetOnSuccess>
          <AreaFields stops={active} name="" selected={[]} id="new" />
          <div>
            <SubmitButton>Crear corredor</SubmitButton>
          </div>
        </ActionForm>
      </Card>
    </>
  );
}

function IntercityCard({ settings, stops }: { settings: ServicesSettings; stops: Stop[] }) {
  const { enabled, closedCities } = settings.intercity;
  const closedJson = JSON.stringify(closedCities);
  const isClosed = (s: Stop) =>
    closedCities.some(
      (c) =>
        c.city.toLowerCase() === s.city.toLowerCase() &&
        c.state.toLowerCase() === s.state.toLowerCase(),
    );
  const openCities = [
    ...new Map(stops.filter((s) => !isClosed(s)).map((s) => [`${s.city}|${s.state}`, s])).values(),
  ].sort((a, b) => a.city.localeCompare(b.city, 'es'));
  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle>Entre ciudades</CardTitle>
          <Badge variant={enabled ? 'default' : 'secondary'}>
            {enabled ? 'Encendido' : 'Apagado'}
          </Badge>
        </div>
        <ActionForm
          action={saveIntercity}
          hidden={{ enabled: String(!enabled), closed: closedJson }}
        >
          <SubmitButton size="sm" variant="outline">
            {enabled ? 'Apagar' : 'Encender'}
          </SubmitButton>
        </ActionForm>
      </div>
      <CardDescription>
        Buses y taxis por puesto entre ciudades, y los taxis de los terminales. Se puede cerrar solo
        en algunas ciudades: no se venden salidas que suban o bajen allí.
      </CardDescription>
      {closedCities.length ? (
        <ul className="flex flex-wrap gap-2">
          {closedCities.map((c) => (
            <li key={`${c.city}|${c.state}`}>
              <ActionForm
                action={saveIntercity}
                hidden={{
                  enabled: String(enabled),
                  closed: JSON.stringify(closedCities.filter((x) => x !== c)),
                }}
              >
                <SubmitButton size="sm" variant="secondary">
                  {c.city}, {c.state} · Reabrir
                </SubmitButton>
              </ActionForm>
            </li>
          ))}
        </ul>
      ) : null}
      <ActionForm action={saveIntercity} hidden={{ enabled: String(enabled), closed: closedJson }}>
        <div className="flex flex-wrap items-end gap-2">
          <Field label="Cerrar en una ciudad" htmlFor="addCity">
            <Select id="addCity" name="addCity" required defaultValue="">
              <option value="">Elige la ciudad</option>
              {openCities.map((s) => (
                <option key={`${s.city}|${s.state}`} value={`${s.city}|${s.state}`}>
                  {s.city}, {s.state}
                </option>
              ))}
            </Select>
          </Field>
          <SubmitButton variant="outline">Cerrar ahí</SubmitButton>
        </div>
      </ActionForm>
    </Card>
  );
}

/** Name and stops of a corridor, with the catalog grouped by city. */
function AreaFields({
  stops,
  name,
  selected,
  id,
}: {
  stops: Stop[];
  name: string;
  selected: string[];
  id: string;
}) {
  const cities = [...new Set(stops.map((s) => `${s.city}, ${s.state}`))].sort((a, b) =>
    a.localeCompare(b, 'es'),
  );
  return (
    <div className="flex flex-col gap-3">
      <Field label="Nombre" htmlFor={`name-${id}`}>
        <Input
          id={`name-${id}`}
          name="name"
          required
          defaultValue={name}
          placeholder="Ciudad Guayana"
        />
      </Field>
      <fieldset className="flex max-h-72 flex-col gap-3 overflow-y-auto rounded-md border p-3">
        <legend className="px-1 text-sm font-medium">Paradas (al menos dos)</legend>
        {cities.map((city) => (
          <div key={city} className="flex flex-col gap-1">
            <p className="text-xs font-medium text-muted-foreground">{city}</p>
            {stops
              .filter((s) => `${s.city}, ${s.state}` === city)
              .map((s) => (
                <label key={s.id} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    name="stopId"
                    value={s.id}
                    defaultChecked={selected.includes(s.id)}
                  />
                  {s.name}
                </label>
              ))}
          </div>
        ))}
      </fieldset>
    </div>
  );
}
