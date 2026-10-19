import {
  CURRENCIES,
  DAY_OF_WEEK_LABELS,
  ROUTE_STATUS_LABELS,
  SERVICE_CLASS_LABELS,
  SERVICE_CLASSES,
  formatDuration,
  type OrganizationMembershipSummary,
  type Route,
  type Stop,
} from '@vtp/shared-types';
import Link from 'next/link';
import { Suspense } from 'react';
import { ActionForm, SubmitButton } from '@/components/portal/action-form';
import { RouteEditor } from '@/components/portal/route-editor';
import { Badge } from '@/components/ui/badge';
import { Card, CardDescription, CardTitle } from '@/components/ui/card';
import { Input, Select } from '@/components/ui/input';
import { Field } from '@/components/ui/label';
import { statusVariant } from '@/lib/labels';
import { apiFetch } from '@/lib/server/api';
import {
  addSchedule,
  changeRouteStatus,
  deleteRoute,
  deleteSchedule,
  saveFares,
  setScheduleActive,
  updateRoute,
} from '../actions';

export default function RoutePage({
  params,
}: PageProps<'/portal/organizations/[organizationId]/routes/[routeId]'>) {
  return (
    <Suspense fallback={<p className="text-muted-foreground">Cargando…</p>}>
      <RouteDetail params={params} />
    </Suspense>
  );
}

/** Mon–Sun order for display; values follow Date#getUTCDay (0 = Sunday). */
const WEEK = [1, 2, 3, 4, 5, 6, 0];

function daysLabel(days: number[]): string {
  if (days.length === 7) return 'Todos los días';
  if (days.join() === '1,2,3,4,5') return 'Lunes a viernes';
  if (days.join() === '0,6') return 'Fines de semana';
  return WEEK.filter((d) => days.includes(d))
    .map((d) => DAY_OF_WEEK_LABELS[d]!.slice(0, 3))
    .join(', ');
}

async function RouteDetail({
  params,
}: {
  params: Promise<{ organizationId: string; routeId: string }>;
}) {
  const { organizationId, routeId } = await params;
  const base = `/organizations/${encodeURIComponent(organizationId)}`;
  const [{ organization, permissions }, route] = await Promise.all([
    apiFetch<OrganizationMembershipSummary>(base),
    apiFetch<Route>(`${base}/routes/${encodeURIComponent(routeId)}`),
  ]);
  const canManage = permissions.includes('routes.manage');
  const hidden = { organizationId: organization.id, routeId: route.id };
  const origin = route.stops[0]!;
  const destination = route.stops.at(-1)!;

  return (
    <>
      <div className="flex flex-col gap-2">
        <Link
          href={`/portal/organizations/${organization.id}`}
          className="text-sm text-muted-foreground hover:underline"
        >
          ← {organization.tradeName ?? organization.legalName}
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold">{route.name}</h1>
          <Badge variant={statusVariant(route.status === 'draft' ? 'pending' : route.status)}>
            {ROUTE_STATUS_LABELS[route.status]}
          </Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          {origin.stop.city} → {destination.stop.city} · {route.stops.length} paradas ·{' '}
          {formatDuration(destination.minutesFromOrigin)}
        </p>
      </div>

      {canManage ? <Publish route={route} hidden={hidden} /> : null}

      <Card>
        <CardTitle>Recorrido</CardTitle>
        <ol className="flex flex-col divide-y">
          {route.stops.map(({ stop, minutesFromOrigin }, index) => (
            <li key={stop.id} className="flex items-center justify-between gap-3 py-2 text-sm">
              <span>
                <span className="text-muted-foreground">{index + 1}.</span> {stop.name} ·{' '}
                {stop.city}, {stop.state}
              </span>
              <span className="text-muted-foreground">
                {index === 0 ? 'Salida' : `+${formatDuration(minutesFromOrigin)}`}
              </span>
            </li>
          ))}
        </ol>
        {canManage ? (
          <details className="rounded-md border p-3">
            <summary className="cursor-pointer text-sm font-medium">Editar recorrido</summary>
            <p className="my-2 text-xs text-muted-foreground">
              Si quitas o reordenas paradas, se borran los precios que ya no correspondan.
            </p>
            <Suspense>
              <EditStops route={route} hidden={hidden} />
            </Suspense>
          </details>
        ) : null}
      </Card>

      <Fares route={route} hidden={hidden} canManage={canManage} />
      <Schedules route={route} hidden={hidden} canManage={canManage} />
    </>
  );
}

function Publish({ route, hidden }: { route: Route; hidden: Record<string, string> }) {
  const active = route.status === 'active';
  // One form in a fixed position, so its confirmation survives the status change.
  return (
    <Card>
      <CardDescription>
        {active
          ? 'Publicada: sus horarios activos aparecen en la búsqueda de pasajeros.'
          : `${route.status === 'draft' ? 'Borrador' : 'Desactivada'}: los pasajeros aún no la ven. Para publicarla necesitas al menos un horario activo y el precio del origen al destino final. La organización debe estar aprobada.`}
      </CardDescription>
      <div className="flex flex-wrap items-start gap-2">
        <ActionForm
          action={changeRouteStatus}
          hidden={{ ...hidden, status: active ? 'inactive' : 'active' }}
        >
          <div>
            <SubmitButton variant={active ? 'outline' : 'default'}>
              {active
                ? 'Desactivar ruta'
                : route.status === 'draft'
                  ? 'Publicar ruta'
                  : 'Reactivar ruta'}
            </SubmitButton>
          </div>
        </ActionForm>
        {route.status === 'draft' ? (
          <ActionForm action={deleteRoute} hidden={hidden}>
            <div>
              <SubmitButton variant="outline">Eliminar borrador</SubmitButton>
            </div>
          </ActionForm>
        ) : null}
      </div>
    </Card>
  );
}

async function EditStops({ route, hidden }: { route: Route; hidden: Record<string, string> }) {
  const catalog = await apiFetch<Stop[]>('/stops');
  // Keep the route's own stops selectable even if one was deactivated later.
  const known = new Set(catalog.map((s) => s.id));
  const stops = [...catalog, ...route.stops.map((s) => s.stop).filter((s) => !known.has(s.id))];
  return (
    <RouteEditor
      action={updateRoute}
      hidden={hidden}
      stops={stops}
      initial={{
        name: route.name,
        stops: route.stops.map((s) => ({
          stopId: s.stop.id,
          minutesFromOrigin: s.minutesFromOrigin,
        })),
      }}
      submitLabel="Guardar recorrido"
    />
  );
}

function Fares({
  route,
  hidden,
  canManage,
}: {
  route: Route;
  hidden: Record<string, string>;
  canManage: boolean;
}) {
  const pairs = route.stops.flatMap((from, i) =>
    route.stops.slice(i + 1).map((to) => ({ from: from.stop, to: to.stop })),
  );
  const fareFor = (fromId: string, toId: string) =>
    route.fares.find((f) => f.fromStopId === fromId && f.toStopId === toId);

  return (
    <Card>
      <div className="flex flex-col gap-1">
        <CardTitle>Precios</CardTitle>
        <CardDescription>
          Precio por pasajero entre cada par de paradas. Deja vacío lo que no vendes.
        </CardDescription>
      </div>
      <ActionForm action={saveFares} hidden={hidden}>
        <table className="w-full text-sm">
          <thead className="text-left text-muted-foreground">
            <tr>
              <th className="py-2 font-normal">Desde</th>
              <th className="py-2 font-normal">Hasta</th>
              <th className="py-2 font-normal">Precio</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {pairs.map(({ from, to }) => {
              const key = `${from.id}:${to.id}`;
              const fare = fareFor(from.id, to.id);
              return (
                <tr key={key}>
                  <td className="py-2 pr-2">{from.city}</td>
                  <td className="py-2 pr-2">{to.city}</td>
                  <td className="py-2">
                    {canManage ? (
                      <div className="flex max-w-56 gap-2">
                        <input type="hidden" name="pair" value={key} />
                        <Input
                          name={`amount:${key}`}
                          inputMode="decimal"
                          defaultValue={fare?.amount}
                          aria-label={`Precio de ${from.city} a ${to.city}`}
                          placeholder="—"
                        />
                        <Select
                          name={`currency:${key}`}
                          defaultValue={fare?.currency ?? 'USD'}
                          aria-label={`Moneda de ${from.city} a ${to.city}`}
                          className="w-24"
                        >
                          {CURRENCIES.map((c) => (
                            <option key={c}>{c}</option>
                          ))}
                        </Select>
                      </div>
                    ) : fare ? (
                      `${fare.amount} ${fare.currency}`
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {canManage ? (
          <div>
            <SubmitButton>Guardar precios</SubmitButton>
          </div>
        ) : null}
      </ActionForm>
    </Card>
  );
}

function Schedules({
  route,
  hidden,
  canManage,
}: {
  route: Route;
  hidden: Record<string, string>;
  canManage: boolean;
}) {
  const arrival = route.stops.at(-1)!.minutesFromOrigin;
  const arrivalTime = (departure: string) => {
    const [h, m] = departure.split(':').map(Number);
    const total = h! * 60 + m! + arrival;
    const days = Math.floor(total / 1440);
    const rest = total % 1440;
    const time = `${String(Math.floor(rest / 60)).padStart(2, '0')}:${String(rest % 60).padStart(2, '0')}`;
    return days ? `${time} (+${days} d)` : time;
  };
  return (
    <Card>
      <div className="flex flex-col gap-1">
        <CardTitle>Horarios</CardTitle>
        <CardDescription>Salidas desde el origen, en hora de Venezuela.</CardDescription>
      </div>
      {route.schedules.length === 0 ? (
        <p className="text-sm text-muted-foreground">Aún no hay horarios.</p>
      ) : (
        <ul className="flex flex-col divide-y">
          {route.schedules.map((schedule) => (
            <li
              key={schedule.id}
              className="flex flex-wrap items-center justify-between gap-3 py-3"
            >
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-medium">
                    {schedule.departureTime} → {arrivalTime(schedule.departureTime)}
                  </p>
                  <Badge variant="outline">{SERVICE_CLASS_LABELS[schedule.serviceClass]}</Badge>
                  {schedule.active ? null : <Badge variant="secondary">Inactivo</Badge>}
                </div>
                <p className="text-sm text-muted-foreground">
                  {daysLabel(schedule.daysOfWeek)} · {schedule.seats} puestos · desde{' '}
                  {schedule.validFrom}
                  {schedule.validUntil ? ` hasta ${schedule.validUntil}` : ''}
                </p>
              </div>
              {canManage ? (
                <div className="flex gap-2">
                  <ActionForm
                    action={setScheduleActive}
                    hidden={{
                      ...hidden,
                      scheduleId: schedule.id,
                      active: String(!schedule.active),
                    }}
                  >
                    <SubmitButton size="sm" variant="outline">
                      {schedule.active ? 'Pausar' : 'Activar'}
                    </SubmitButton>
                  </ActionForm>
                  <ActionForm
                    action={deleteSchedule}
                    hidden={{ ...hidden, scheduleId: schedule.id }}
                  >
                    <SubmitButton size="sm" variant="ghost">
                      Eliminar
                    </SubmitButton>
                  </ActionForm>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      {canManage ? <AddSchedule hidden={hidden} /> : null}
    </Card>
  );
}

function AddSchedule({ hidden }: { hidden: Record<string, string> }) {
  return (
    <details className="rounded-md border p-3">
      <summary className="cursor-pointer text-sm font-medium">Agregar horario</summary>
      <ActionForm action={addSchedule} hidden={hidden} className="mt-3" resetOnSuccess>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Hora de salida" htmlFor="departureTime">
            <Input id="departureTime" name="departureTime" type="time" required />
          </Field>
          <Field label="Servicio" htmlFor="serviceClass">
            <Select id="serviceClass" name="serviceClass" defaultValue="standard">
              {SERVICE_CLASSES.map((c) => (
                <option key={c} value={c}>
                  {SERVICE_CLASS_LABELS[c]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Puestos" htmlFor="seats">
            <Input id="seats" name="seats" type="number" min={1} max={100} required />
          </Field>
          <Field label="Desde" htmlFor="validFrom">
            <Input id="validFrom" name="validFrom" type="date" required />
          </Field>
          <Field label="Hasta (opcional)" htmlFor="validUntil">
            <Input id="validUntil" name="validUntil" type="date" />
          </Field>
        </div>
        <fieldset className="flex flex-col gap-2">
          <legend className="text-sm font-medium">Días</legend>
          <div className="flex flex-wrap gap-3">
            {WEEK.map((day) => (
              <label key={day} className="flex items-center gap-1 text-sm">
                <input type="checkbox" name="day" value={day} defaultChecked />
                {DAY_OF_WEEK_LABELS[day]}
              </label>
            ))}
          </div>
        </fieldset>
        <div>
          <SubmitButton>Agregar horario</SubmitButton>
        </div>
      </ActionForm>
    </details>
  );
}
