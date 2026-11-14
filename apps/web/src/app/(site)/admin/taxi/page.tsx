import {
  localPhone,
  MAX_MOTO_PASSENGERS,
  networkClock,
  TAXI_DIRECTION_LABELS,
  TAXI_DIRECTIONS,
  TAXI_RIDE_STATUS_LABELS,
  TAXI_VEHICLE_TYPE_LABELS,
  TAXI_VEHICLE_TYPES,
  taxiRideRoute,
  vehicleName,
  type AssistedTaxiRide,
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
  const [terminals, rides, origin] = await Promise.all([
    apiFetch<TaxiTerminal[]>('/taxi/terminals', { auth: false }),
    apiFetch<AssistedTaxiRide[]>('/admin/taxi-rides'),
    siteOrigin(),
  ]);
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
          dijo y los conductores de la zona lo ven en su app, igual que un pedido normal. Luego
          mándale el enlace de seguimiento con el botón verde; ahí ve la placa, puede cancelar y
          calificar sin cuenta.
        </p>
      </div>

      <Card>
        <CardTitle>Nuevo pedido</CardTitle>
        {terminals.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Todavía ninguna línea de taxi atiende un terminal. Cuando una línea elija sus terminales
            en el portal, aparecen aquí.
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
              <Field label="Vehículo" htmlFor="vehicleType">
                <Select id="vehicleType" name="vehicleType" defaultValue="car">
                  {TAXI_VEHICLE_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {TAXI_VEHICLE_TYPE_LABELS[type]}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Zona (terminal o parada de taxis)" htmlFor="terminalStopId">
                <Select id="terminalStopId" name="terminalStopId" required>
                  {terminals.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} · {t.city}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Viaje" htmlFor="direction">
                <Select id="direction" name="direction" defaultValue="local">
                  {TAXI_DIRECTIONS.map((d) => (
                    <option key={d} value={d}>
                      {TAXI_DIRECTION_LABELS[d]}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Pasajeros" htmlFor="passengers">
                <Input
                  id="passengers"
                  name="passengers"
                  type="number"
                  min={1}
                  max={4}
                  defaultValue={1}
                  required
                />
              </Field>
              <Field label="Dónde lo buscan (o a dónde va, si sale del terminal)" htmlFor="address">
                <Input
                  id="address"
                  name="address"
                  required
                  minLength={5}
                  maxLength={200}
                  placeholder="Calle, sector y un punto de referencia"
                />
              </Field>
              <Field label="Destino (solo dentro de la ciudad)" htmlFor="destination">
                <Input id="destination" name="destination" maxLength={200} />
              </Field>
            </div>
            <Field label="Notas para el conductor (opcional)" htmlFor="notes">
              <Textarea id="notes" name="notes" maxLength={200} rows={2} />
            </Field>
            <p className="text-xs text-muted-foreground">
              El mototaxi lleva a {MAX_MOTO_PASSENGERS} persona. La tarifa la dice el conductor que
              lo tome y se le paga a él.
            </p>
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
                      {TAXI_VEHICLE_TYPE_LABELS[ride.vehicleType]} · {taxiRideRoute(ride)}
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
