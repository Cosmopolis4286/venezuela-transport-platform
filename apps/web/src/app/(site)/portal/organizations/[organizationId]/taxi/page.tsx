import {
  TAXI_DIRECTION_LABELS,
  TAXI_RIDE_STATUS_LABELS,
  TRANSPORT_MODE_LABELS,
  formatMoney,
  localPhone,
  networkClock,
  vehicleName,
  type OnDemandFare,
  type OrganizationMembershipSummary,
  type OperatingZone,
  type Stop,
  type StopSummary,
  type TaxiDispatchBoard,
  type TaxiRequest,
} from '@vtp/shared-types';
import Link from 'next/link';
import { Suspense } from 'react';
import { ActionForm, SubmitButton } from '@/components/portal/action-form';
import { AutoRefresh } from '@/components/portal/auto-refresh';
import { Badge } from '@/components/ui/badge';
import { Card, CardDescription, CardTitle } from '@/components/ui/card';
import { Input, Select } from '@/components/ui/input';
import { Field } from '@/components/ui/label';
import { apiFetch } from '@/lib/server/api';
import { assignTaxiRide, releaseTaxiRide, saveStretchFares, saveTaxiTerminals } from './actions';

export default function TaxiPage({
  params,
}: PageProps<'/portal/organizations/[organizationId]/taxi'>) {
  return (
    <Suspense fallback={<p className="text-muted-foreground">Cargando…</p>}>
      <Taxi params={params} />
    </Suspense>
  );
}

const person = (p: { firstName: string | null; lastName: string | null }) =>
  [p.firstName, p.lastName].filter(Boolean).join(' ') || 'Sin nombre';

/** Terminal rides by direction; stretch rides (ADR-028) by their stops and pickup address. */
const route = (
  ride: Pick<TaxiRequest, 'kind' | 'direction' | 'terminal' | 'from' | 'to' | 'address'>,
) =>
  ride.kind === 'stretch' || !ride.terminal
    ? `${ride.from?.city} → ${ride.to?.city} · buscar en ${ride.address}`
    : ride.direction === 'from_terminal'
      ? `${ride.terminal.name} → ${ride.address}`
      : `${ride.address} → ${ride.terminal.name}`;

/** "Desde el terminal", or "Moto · para el 12/11 06:30" / "Taxi · ahora". */
const what = (ride: Pick<TaxiRequest, 'kind' | 'direction' | 'mode' | 'scheduledFor'>) =>
  ride.kind === 'stretch' || !ride.direction
    ? `${TRANSPORT_MODE_LABELS[ride.mode]} · ${
        ride.scheduledFor
          ? `para el ${new Date(ride.scheduledFor).toLocaleDateString('es-VE', { day: '2-digit', month: '2-digit', timeZone: 'America/Caracas' })} ${networkClock(ride.scheduledFor)}`
          : 'ahora'
      }`
    : TAXI_DIRECTION_LABELS[ride.direction];

/** Empty rows offered under the line's fares, to add new stretches. */
const NEW_FARE_ROWS = 3;

async function Taxi({ params }: { params: Promise<{ organizationId: string }> }) {
  const { organizationId } = await params;
  const base = `/organizations/${encodeURIComponent(organizationId)}`;
  const { organization, permissions } = await apiFetch<OrganizationMembershipSummary>(base);
  const canDispatch = permissions.includes('operations.dispatch');
  const canManage = permissions.includes('routes.manage');
  // Taxi lines serve terminals and ride stretches on demand; motorcycle taxi lines only ride.
  const taxiLine = organization.type === 'taxi_line';
  const [terminals, board, catalog, fares, areas] = await Promise.all([
    taxiLine ? apiFetch<StopSummary[]>(`${base}/taxi/terminals`) : Promise.resolve([]),
    canDispatch ? apiFetch<TaxiDispatchBoard>(`${base}/taxi`) : null,
    canManage && taxiLine ? apiFetch<Stop[]>('/stops?kind=terminal', { auth: false }) : null,
    apiFetch<OnDemandFare[]>(`${base}/taxi/stretch-fares`),
    apiFetch<OperatingZone[]>('/zones'),
  ]);
  const mode = taxiLine ? 'car' : 'motorcycle';
  // Stretches are between two stops of one zone that sells (ADR-028).
  const selling = areas.filter((z) => z.status === 'active');
  const zoneStops = await Promise.all(
    selling.map((z) => apiFetch<Stop[]>(`/stops?zoneId=${encodeURIComponent(z.id)}`)),
  );
  const zoneStopList = selling.flatMap((z, i) =>
    zoneStops[i]!.map((s) => ({ ...s, area: z.name })),
  );
  const hidden = { organizationId: organization.id };
  const served = new Set(terminals.map((t) => t.id));

  return (
    <>
      <div className="flex flex-col gap-2">
        <Link
          href={`/portal/organizations/${organization.id}`}
          className="text-sm text-muted-foreground hover:underline"
        >
          ← {organization.tradeName ?? organization.legalName}
        </Link>
        <h1 className="text-2xl font-semibold">{taxiLine ? 'Taxis' : 'Mototaxis'}</h1>
        <p className="text-sm text-muted-foreground">
          {taxiLine
            ? 'Los pasajeros piden un taxi desde o hacia un terminal, o entre dos paradas de una zona. La primera línea que toma la solicitud se queda con el viaje; el pasajero le paga al conductor.'
            : 'Los pasajeros piden una moto entre dos paradas de una zona, para ahora o para más tarde. La primera línea que toma la solicitud se queda con el viaje y cobra su tarifa del tramo; el pasajero le paga al conductor.'}
        </p>
      </div>

      <Card>
        <div className="flex flex-col gap-1">
          <CardTitle>Tarifas por tramo, bajo demanda ({fares.length})</CardTitle>
          <CardDescription>
            Entre dos paradas de una zona, en los dos sentidos. El pasajero las ve antes de pedir, y
            la línea solo ve las solicitudes de los tramos que tiene aquí. Deja el monto vacío para
            quitar un tramo.
          </CardDescription>
        </div>
        {zoneStopList.length === 0 ? (
          <p className="text-sm text-muted-foreground">Todavía no hay zonas que vendan.</p>
        ) : canManage ? (
          <ActionForm action={saveStretchFares} hidden={{ ...hidden, mode }}>
            {[
              ...fares.map((f) => f as OnDemandFare | null),
              ...Array(NEW_FARE_ROWS).fill(null),
            ].map((f: OnDemandFare | null, i: number) => (
              <div key={i} className="grid items-end gap-2 sm:grid-cols-[1fr_1fr_8rem_6rem]">
                <Field label="Entre" htmlFor={`a-${i}`}>
                  <StopChoice
                    id={`a-${i}`}
                    name={`a:${i}`}
                    stops={zoneStopList}
                    value={f?.stops[0].id}
                  />
                </Field>
                <Field label="y" htmlFor={`b-${i}`}>
                  <StopChoice
                    id={`b-${i}`}
                    name={`b:${i}`}
                    stops={zoneStopList}
                    value={f?.stops[1].id}
                  />
                </Field>
                <Field label="Tarifa" htmlFor={`amount-${i}`}>
                  <Input
                    id={`amount-${i}`}
                    name={`amount:${i}`}
                    inputMode="decimal"
                    defaultValue={f?.amount ?? ''}
                    placeholder="4,00"
                  />
                </Field>
                <Field label="Moneda" htmlFor={`currency-${i}`}>
                  <Select
                    id={`currency-${i}`}
                    name={`currency:${i}`}
                    defaultValue={f?.currency ?? 'USD'}
                  >
                    <option value="USD">US$</option>
                    <option value="VES">Bs.</option>
                  </Select>
                </Field>
              </div>
            ))}
            <div>
              <SubmitButton variant="outline">Guardar tarifas</SubmitButton>
            </div>
          </ActionForm>
        ) : fares.length ? (
          <ul className="text-sm">
            {fares.map((f) => (
              <li key={`${f.stops[0].id}:${f.stops[1].id}`}>
                {f.stops[0].city} ↔ {f.stops[1].city}: {formatMoney(f.amount, f.currency)}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">Todavía no hay tarifas por tramo.</p>
        )}
      </Card>

      {taxiLine ? (
        <Card>
          <div className="flex flex-col gap-1">
            <CardTitle>Terminales donde opera la línea ({terminals.length})</CardTitle>
            <CardDescription>Solo se ven las solicitudes de estos terminales.</CardDescription>
          </div>
          {catalog ? (
            <ActionForm action={saveTaxiTerminals} hidden={hidden}>
              <div className="grid gap-2 sm:grid-cols-2">
                {/* The terminals already served first. */}
                {[...catalog]
                  .sort((a, b) => Number(served.has(b.id)) - Number(served.has(a.id)))
                  .map((stop) => (
                    <label key={stop.id} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        name="stopId"
                        value={stop.id}
                        defaultChecked={served.has(stop.id)}
                      />
                      {stop.name} · {stop.city}
                    </label>
                  ))}
              </div>
              <div>
                <SubmitButton variant="outline">Guardar terminales</SubmitButton>
              </div>
            </ActionForm>
          ) : terminals.length ? (
            <p className="text-sm">{terminals.map((t) => t.name).join(' · ')}</p>
          ) : (
            <p className="text-sm text-muted-foreground">Todavía no opera en ningún terminal.</p>
          )}
        </Card>
      ) : null}

      {board ? (
        <>
          <AutoRefresh seconds={10} />
          <Card>
            <div className="flex flex-col gap-1">
              <CardTitle>Solicitudes ({board.requests.length})</CardTitle>
              <CardDescription>
                Se actualiza sola. Asigna un conductor libre y un vehículo, con la tarifa acordada.
              </CardDescription>
            </div>
            {board.requests.length === 0 ? (
              <p className="text-sm text-muted-foreground">No hay solicitudes abiertas.</p>
            ) : (
              <ul className="flex flex-col divide-y">
                {board.requests.map((request) => (
                  <li key={request.id} className="flex flex-col gap-3 py-3">
                    <div>
                      <p className="font-medium">{route(request)}</p>
                      <p className="text-sm text-muted-foreground">
                        {what(request)}
                        {request.paidWithPack ? ' · pagado con paquete' : ''} · {request.passengers}{' '}
                        {request.passengers === 1 ? 'pasajero' : 'pasajeros'} · pedido a las{' '}
                        {networkClock(request.requestedAt)} · vence a las{' '}
                        {networkClock(request.expiresAt)}
                        {request.notes ? ` · ${request.notes}` : ''}
                      </p>
                      {request.feesDue.length ? (
                        <p className="text-sm text-amber-700 dark:text-amber-400">
                          El conductor cobra además{' '}
                          {request.feesDue
                            .map((f) => formatMoney(f.amount, f.currency))
                            .join(' + ')}{' '}
                          de una cancelación anterior del pasajero (en efectivo).
                        </p>
                      ) : null}
                    </div>
                    <ActionForm action={assignTaxiRide} hidden={{ ...hidden, rideId: request.id }}>
                      <div className="grid items-end gap-3 sm:grid-cols-[1fr_1fr_8rem_6rem_auto]">
                        <Field label="Conductor" htmlFor={`driver-${request.id}`}>
                          <Select id={`driver-${request.id}`} name="driverUserId" required>
                            {board.drivers.map((driver) => (
                              <option
                                key={driver.userId}
                                value={driver.userId}
                                disabled={driver.busy}
                              >
                                {person(driver)}
                                {driver.busy ? ' (en un viaje)' : ''}
                              </option>
                            ))}
                          </Select>
                        </Field>
                        <Field label="Vehículo" htmlFor={`vehicle-${request.id}`}>
                          <Select id={`vehicle-${request.id}`} name="vehicleId" required>
                            {board.vehicles.map((vehicle) => (
                              <option key={vehicle.id} value={vehicle.id} disabled={vehicle.busy}>
                                {vehicleName(vehicle)}
                                {vehicle.busy ? ' (en un viaje)' : ''}
                              </option>
                            ))}
                          </Select>
                        </Field>
                        {request.kind === 'stretch' ? (
                          <p className="col-span-2 text-sm text-muted-foreground">
                            Tarifa fija de la línea para el tramo.
                          </p>
                        ) : (
                          <>
                            <Field label="Tarifa" htmlFor={`fare-${request.id}`}>
                              <Input
                                id={`fare-${request.id}`}
                                name="fareAmount"
                                inputMode="decimal"
                                required
                                placeholder="8,00"
                              />
                            </Field>
                            <Field label="Moneda" htmlFor={`currency-${request.id}`}>
                              <Select id={`currency-${request.id}`} name="fareCurrency">
                                <option value="USD">US$</option>
                                <option value="VES">Bs.</option>
                              </Select>
                            </Field>
                          </>
                        )}
                        <SubmitButton size="sm">Asignar</SubmitButton>
                      </div>
                    </ActionForm>
                  </li>
                ))}
              </ul>
            )}
            {board.drivers.length === 0 || board.vehicles.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Para asignar necesitas conductores (rol Conductor) y{' '}
                <Link
                  href={`/portal/organizations/${organization.id}/vehicles`}
                  className="underline"
                >
                  vehículos
                </Link>
                .
              </p>
            ) : null}
          </Card>

          <Card>
            <CardTitle>Viajes de la línea ({board.rides.length})</CardTitle>
            {board.rides.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Ningún viaje en curso ni en las últimas 24 horas.
              </p>
            ) : (
              <ul className="flex flex-col divide-y">
                {board.rides.map((ride) => (
                  <li
                    key={ride.id}
                    className="flex flex-wrap items-center justify-between gap-3 py-3"
                  >
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{route(ride)}</span>
                        <Badge
                          variant={
                            ride.status === 'completed'
                              ? 'secondary'
                              : ride.status === 'cancelled'
                                ? 'destructive'
                                : 'success'
                          }
                        >
                          {TAXI_RIDE_STATUS_LABELS[ride.status]}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {person(ride.driver)} · {vehicleName(ride.vehicle)} ·{' '}
                        {formatMoney(ride.fare.amount, ride.fare.currency)}
                        {ride.feesDue.length
                          ? ` + tasa de cancelación ${ride.feesDue
                              .map((f) => formatMoney(f.amount, f.currency))
                              .join(' + ')}`
                          : ''}{' '}
                        · pasajero {person(ride.passenger)}
                        {ride.passenger.phone ? ` (${localPhone(ride.passenger.phone)})` : ''} ·
                        tomado a las {networkClock(ride.acceptedAt)}
                      </p>
                    </div>
                    {ride.status === 'accepted' ? (
                      <ActionForm action={releaseTaxiRide} hidden={{ ...hidden, rideId: ride.id }}>
                        <SubmitButton size="sm" variant="outline">
                          Liberar
                        </SubmitButton>
                      </ActionForm>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </>
      ) : null}
    </>
  );
}

function StopChoice({
  id,
  name,
  stops,
  value,
}: {
  id: string;
  name: string;
  stops: (StopSummary & { area: string })[];
  value?: string;
}) {
  const areas = [...new Set(stops.map((s) => s.area))];
  return (
    <Select id={id} name={name} defaultValue={value ?? ''}>
      <option value="">Parada</option>
      {areas.map((area) => (
        <optgroup key={area} label={area}>
          {stops
            .filter((s) => s.area === area)
            .map((s) => (
              <option key={`${area}:${s.id}`} value={s.id}>
                {s.city} · {s.name}
              </option>
            ))}
        </optgroup>
      ))}
    </Select>
  );
}
