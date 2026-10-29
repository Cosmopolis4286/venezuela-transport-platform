import {
  TAXI_DIRECTION_LABELS,
  TAXI_RIDE_STATUS_LABELS,
  formatMoney,
  localPhone,
  vehicleName,
  type OrganizationMembershipSummary,
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
import { assignTaxiRide, releaseTaxiRide, saveTaxiTerminals } from './actions';

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

/** `HH:MM` in Venezuela for a UTC instant. */
const clock = (iso: string) => new Date(Date.parse(iso) - 4 * 3600_000).toISOString().slice(11, 16);

const route = (ride: Pick<TaxiRequest, 'direction' | 'terminal' | 'address'>) =>
  ride.direction === 'from_terminal'
    ? `${ride.terminal.name} → ${ride.address}`
    : `${ride.address} → ${ride.terminal.name}`;

async function Taxi({ params }: { params: Promise<{ organizationId: string }> }) {
  const { organizationId } = await params;
  const base = `/organizations/${encodeURIComponent(organizationId)}`;
  const { organization, permissions } = await apiFetch<OrganizationMembershipSummary>(base);
  const canDispatch = permissions.includes('operations.dispatch');
  const canManage = permissions.includes('routes.manage');
  const [terminals, board, catalog] = await Promise.all([
    apiFetch<StopSummary[]>(`${base}/taxi/terminals`),
    canDispatch ? apiFetch<TaxiDispatchBoard>(`${base}/taxi`) : null,
    canManage ? apiFetch<Stop[]>('/stops?kind=terminal', { auth: false }) : null,
  ]);
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
        <h1 className="text-2xl font-semibold">Taxis</h1>
        <p className="text-sm text-muted-foreground">
          Los pasajeros piden un taxi desde o hacia un terminal. La primera línea que toma la
          solicitud se queda con el viaje y fija la tarifa; el pasajero le paga al conductor.
        </p>
      </div>

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
                        {TAXI_DIRECTION_LABELS[request.direction]} · {request.passengers}{' '}
                        {request.passengers === 1 ? 'pasajero' : 'pasajeros'} · pedido a las{' '}
                        {clock(request.requestedAt)} · vence a las {clock(request.expiresAt)}
                        {request.notes ? ` · ${request.notes}` : ''}
                      </p>
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
                        {formatMoney(ride.fare.amount, ride.fare.currency)} · pasajero{' '}
                        {person(ride.passenger)}
                        {ride.passenger.phone ? ` (${localPhone(ride.passenger.phone)})` : ''} ·
                        tomado a las {clock(ride.acceptedAt)}
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
