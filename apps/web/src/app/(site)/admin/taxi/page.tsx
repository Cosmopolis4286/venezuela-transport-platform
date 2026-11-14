import {
  localPhone,
  MAX_TAXI_PASSENGERS,
  networkClock,
  ON_DEMAND_MODES,
  TAXI_RIDE_STATUS_LABELS,
  TRANSPORT_MODE_LABELS,
  taxiRideRoute,
  vehicleName,
  type AssistedTaxiRide,
  type OperatingZone,
  type Stop,
  type TaxiTerminal,
} from '@vtp/shared-types';
import type { Metadata } from 'next';
import { headers } from 'next/headers';
import Link from 'next/link';
import { Suspense } from 'react';
import { ActionForm, SubmitButton } from '@/components/portal/action-form';
import { AutoRefresh } from '@/components/portal/auto-refresh';
import { Badge } from '@/components/ui/badge';
import { Card, CardDescription, CardTitle } from '@/components/ui/card';
import { Input, Select, Textarea } from '@/components/ui/input';
import { Field } from '@/components/ui/label';
import { apiFetch } from '@/lib/server/api';
import { requirePlatformStaff } from '@/lib/server/session';
import { customerWhatsappLink } from '@/lib/taxi-whatsapp';
import { requestTaxiForCustomer } from '../actions';

export const metadata: Metadata = { title: 'Taxis por WhatsApp' };

export default function AssistedTaxiPage() {
  return (
    <Suspense fallback={<p className="text-muted-foreground">Cargando…</p>}>
      <AssistedTaxi />
    </Suspense>
  );
}

/** This site's address as the browser sees it, to build links staff paste on WhatsApp. */
async function siteOrigin(): Promise<string> {
  const h = await headers();
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? 'localhost:3000';
  const proto =
    h.get('x-forwarded-proto') ?? (/^(localhost|127\.0\.0\.1)(:|$)/.test(host) ? 'http' : 'https');
  return `${proto}://${host}`;
}

async function AssistedTaxi() {
  await requirePlatformStaff();
  const [terminals, rides, origin, zones] = await Promise.all([
    apiFetch<TaxiTerminal[]>('/taxi/terminals', { auth: false }),
    apiFetch<AssistedTaxiRide[]>('/admin/taxi-rides'),
    siteOrigin(),
    apiFetch<OperatingZone[]>('/zones', { auth: false }),
  ]);
  // Stretch rides go between two stops of one zone that sells (ADR-028).
  const selling = zones.filter((z) => z.status === 'active');
  const zoneStops = await Promise.all(
    selling.map((z) =>
      apiFetch<Stop[]>(`/stops?zoneId=${encodeURIComponent(z.id)}`, { auth: false }),
    ),
  );
  const stopGroups = selling
    .map((z, i) => ({ zone: z, stops: zoneStops[i]! }))
    .filter((g) => g.stops.length >= 2);
  const stopOptions = stopGroups.map(({ zone, stops }) => (
    <optgroup key={zone.id} label={zone.name}>
      {stops.map((s) => (
        <option key={s.id} value={s.id}>
          {s.name}
        </option>
      ))}
    </optgroup>
  ));
  const open = rides.some((r) => ['requested', 'accepted', 'in_progress'].includes(r.ride.status));

  return (
    <>
      {open ? <AutoRefresh seconds={20} /> : null}
      <div className="flex flex-col gap-2">
        <Link href="/admin" className="text-sm text-muted-foreground hover:underline">
          ← Administración
        </Link>
        <h1 className="text-2xl font-semibold">Taxis y mototaxis por WhatsApp</h1>
        <p className="text-sm text-muted-foreground">
          Para quien escribe al WhatsApp (opción 2 del menú) y no usa la app: copia aquí lo que te
          dijo y los conductores lo ven en su app, igual que un pedido normal. Luego mándale el
          enlace de seguimiento con el botón verde; ahí ve la placa y la tarifa, puede cancelar y
          calificar sin cuenta. Por tramo, el precio es la tarifa fija de la línea.
        </p>
      </div>

      <Card>
        <CardTitle>Nuevo pedido</CardTitle>
        {terminals.length === 0 && stopGroups.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Todavía ninguna línea atiende un terminal ni hay zonas con paradas a la venta.
          </p>
        ) : (
          <ActionForm action={requestTaxiForCustomer} resetOnSuccess>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Nombre del cliente" htmlFor="customerName">
                <Input
                  id="customerName"
                  name="customerName"
                  required
                  minLength={2}
                  maxLength={80}
                />
              </Field>
              <Field label="Teléfono (WhatsApp)" htmlFor="customerPhone">
                <Input
                  id="customerPhone"
                  name="customerPhone"
                  required
                  placeholder="0414-1234567"
                  inputMode="tel"
                />
              </Field>
              <Field label="Viaje" htmlFor="trip">
                <Select
                  id="trip"
                  name="trip"
                  defaultValue={stopGroups.length > 0 ? 'stretch' : 'from_terminal'}
                >
                  {stopGroups.length > 0 ? (
                    <option value="stretch">Taxi o moto entre dos paradas (tarifa fija)</option>
                  ) : null}
                  {terminals.length > 0 ? (
                    <>
                      <option value="from_terminal">Taxi desde un terminal</option>
                      <option value="to_terminal">Taxi hacia un terminal</option>
                    </>
                  ) : null}
                </Select>
              </Field>
              <Field label="Pasajeros (la moto lleva a 1)" htmlFor="passengers">
                <Input
                  id="passengers"
                  name="passengers"
                  type="number"
                  min={1}
                  max={MAX_TAXI_PASSENGERS}
                  defaultValue={1}
                  required
                />
              </Field>
            </div>
            {stopGroups.length > 0 ? (
              <fieldset className="grid gap-3 rounded-md border p-3 sm:grid-cols-3">
                <legend className="px-1 text-sm text-muted-foreground">Entre dos paradas</legend>
                <Field label="Desde" htmlFor="fromStopId">
                  <Select id="fromStopId" name="fromStopId">
                    {stopOptions}
                  </Select>
                </Field>
                <Field label="Hasta" htmlFor="toStopId">
                  <Select id="toStopId" name="toStopId">
                    {stopOptions}
                  </Select>
                </Field>
                <Field label="Vehículo" htmlFor="mode">
                  <Select id="mode" name="mode" defaultValue="motorcycle">
                    {ON_DEMAND_MODES.map((m) => (
                      <option key={m} value={m}>
                        {TRANSPORT_MODE_LABELS[m]}
                      </option>
                    ))}
                  </Select>
                </Field>
              </fieldset>
            ) : null}
            {terminals.length > 0 ? (
              <fieldset className="grid gap-3 rounded-md border p-3">
                <legend className="px-1 text-sm text-muted-foreground">
                  Desde o hacia un terminal
                </legend>
                <Field label="Terminal" htmlFor="terminalStopId">
                  <Select id="terminalStopId" name="terminalStopId">
                    {terminals.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name} · {t.city}
                      </option>
                    ))}
                  </Select>
                </Field>
              </fieldset>
            ) : null}
            <Field
              label="Dirección (dónde lo buscan; si sale del terminal, a dónde va)"
              htmlFor="address"
            >
              <Input
                id="address"
                name="address"
                required
                minLength={5}
                maxLength={200}
                placeholder="Calle, sector y un punto de referencia"
              />
            </Field>
            <Field label="Notas para el conductor (opcional)" htmlFor="notes">
              <Textarea id="notes" name="notes" maxLength={200} rows={2} />
            </Field>
            <div>
              <SubmitButton>Pedir</SubmitButton>
            </div>
          </ActionForm>
        )}
      </Card>

      <Card>
        <div className="flex flex-col gap-1">
          <CardTitle>Últimas 48 horas</CardTitle>
          <CardDescription>
            El botón de WhatsApp abre el chat con el mensaje que toca según cómo va el viaje: el
            enlace al pedirlo, la placa cuando un conductor lo toma, la calificación al final.
          </CardDescription>
        </div>
        {rides.length === 0 ? (
          <p className="text-sm text-muted-foreground">Ningún pedido por WhatsApp todavía.</p>
        ) : (
          <ul className="flex flex-col divide-y">
            {rides.map((assisted) => {
              const { ride, customer } = assisted;
              const url = `${origin}/es${assisted.trackingPath}`;
              const link = customerWhatsappLink(assisted, url);
              return (
                <li key={ride.id} className="flex flex-wrap items-start justify-between gap-3 py-3">
                  <div className="flex flex-col gap-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">
                        {customer.name} · {localPhone(customer.phone)}
                      </span>
                      <Badge
                        variant={
                          ride.status === 'cancelled' || ride.status === 'expired'
                            ? 'destructive'
                            : ride.status === 'completed'
                              ? 'secondary'
                              : 'success'
                        }
                      >
                        {TAXI_RIDE_STATUS_LABELS[ride.status]}
                      </Badge>
                    </div>
                    <p className="text-sm">
                      {TRANSPORT_MODE_LABELS[ride.mode]} · {taxiRideRoute(ride)}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Pedido a las {networkClock(ride.requestedAt)}
                      {ride.vehicle ? ` · ${vehicleName(ride.vehicle)}` : ''}
                      {ride.driver?.firstName ? ` · ${ride.driver.firstName}` : ''}
                      {ride.driver?.phone ? ` (${localPhone(ride.driver.phone)})` : ''}
                      {ride.rating ? ` · ${'★'.repeat(ride.rating)} ${ride.rating}/5` : ''}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1 text-sm">
                    {link ? (
                      <a
                        href={link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="rounded-md bg-green-600 px-3 py-1.5 font-medium text-white hover:bg-green-700"
                      >
                        Escribirle por WhatsApp
                      </a>
                    ) : null}
                    <a
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="hover:underline"
                    >
                      Ver lo que ve el cliente
                    </a>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </>
  );
}
