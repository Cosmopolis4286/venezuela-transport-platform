import {
  SERVICE_CLASS_LABELS,
  longDate,
  todayInVenezuela,
  vehicleName,
  type DispatchBoard,
  type OrganizationMembershipSummary,
  type TripDriver,
} from '@vtp/shared-types';
import Link from 'next/link';
import { Suspense } from 'react';
import { ActionForm, SubmitButton } from '@/components/portal/action-form';
import { Badge } from '@/components/ui/badge';
import { DOCUMENT_ALERT_TEXT, tripProgress } from '@/lib/labels';
import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardTitle } from '@/components/ui/card';
import { Input, Select } from '@/components/ui/input';
import { Field } from '@/components/ui/label';
import { apiFetch } from '@/lib/server/api';
import { assignTrip } from './actions';

export default function DispatchPage({
  params,
  searchParams,
}: PageProps<'/portal/organizations/[organizationId]/dispatch'>) {
  return (
    <Suspense fallback={<p className="text-muted-foreground">Cargando…</p>}>
      <Dispatch params={params} searchParams={searchParams} />
    </Suspense>
  );
}

const driverName = (driver: TripDriver) =>
  [driver.firstName, driver.lastName].filter(Boolean).join(' ') || 'Sin nombre';

/** `HH:MM`, plus the day offset when the trip ends on a later date. */
function clock(localIso: string, serviceDate: string) {
  const days = Math.round(
    (Date.parse(`${localIso.slice(0, 10)}T00:00:00Z`) - Date.parse(`${serviceDate}T00:00:00Z`)) /
      86_400_000,
  );
  return `${localIso.slice(11, 16)}${days > 0 ? ` (+${days})` : ''}`;
}

async function Dispatch({
  params,
  searchParams,
}: {
  params: Promise<{ organizationId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { organizationId } = await params;
  const { date: rawDate } = await searchParams;
  const date =
    typeof rawDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(rawDate)
      ? rawDate
      : todayInVenezuela();
  const base = `/organizations/${encodeURIComponent(organizationId)}`;
  const [{ organization }, board] = await Promise.all([
    apiFetch<OrganizationMembershipSummary>(base),
    apiFetch<DispatchBoard>(`${base}/dispatch?date=${date}`),
  ]);

  return (
    <>
      <div className="flex flex-col gap-2">
        <Link
          href={`/portal/organizations/${organization.id}`}
          className="text-sm text-muted-foreground hover:underline"
        >
          ← {organization.tradeName ?? organization.legalName}
        </Link>
        <h1 className="text-2xl font-semibold">Despacho</h1>
        <p className="text-sm text-muted-foreground">
          Asigna un vehículo y un conductor a cada salida. Un vehículo o un conductor no puede estar
          en dos viajes a la vez.
        </p>
      </div>
      <Card>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="flex flex-col gap-1">
            <CardTitle className="first-letter:uppercase">{longDate(date)}</CardTitle>
            <CardDescription>
              Todas las salidas publicadas del día, por hora de salida desde el origen.
            </CardDescription>
          </div>
          <form className="flex gap-2">
            <Input type="date" name="date" defaultValue={date} aria-label="Fecha" />
            <Button type="submit" variant="outline">
              Ver
            </Button>
          </form>
        </div>
        {board.vehicles.length === 0 || board.drivers.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {board.vehicles.length === 0 ? (
              <>
                Agrega vehículos en{' '}
                <Link
                  href={`/portal/organizations/${organization.id}/vehicles`}
                  className="underline"
                >
                  Vehículos
                </Link>
                .{' '}
              </>
            ) : null}
            {board.drivers.length === 0
              ? 'Invita a tus conductores con el rol Conductor para poder asignarlos.'
              : null}
          </p>
        ) : null}
        {board.departures.length === 0 ? (
          <p className="text-sm text-muted-foreground">No hay salidas ese día.</p>
        ) : (
          <ul className="flex flex-col divide-y">
            {board.departures.map((departure) => {
              const fitting = board.vehicles.filter(
                (v) =>
                  !v.seatLayoutId ||
                  !departure.seatLayoutId ||
                  v.seatLayoutId === departure.seatLayoutId,
              );
              // Keep the current vehicle selectable even if it no longer fits or is inactive.
              const vehicles =
                departure.vehicle && !fitting.some((v) => v.id === departure.vehicle!.id)
                  ? [{ ...departure.vehicle, documentAlert: null }, ...fitting]
                  : fitting;
              const drivers =
                departure.driver &&
                !board.drivers.some((d) => d.userId === departure.driver!.userId)
                  ? [departure.driver, ...board.drivers]
                  : board.drivers;
              const key = `${departure.scheduleId}-${departure.serviceDate}`;
              return (
                <li key={key} className="flex flex-col gap-3 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium tabular-nums">
                        {clock(departure.departsAt, departure.serviceDate)} →{' '}
                        {clock(departure.arrivesAt, departure.serviceDate)}
                      </span>
                      <span>{departure.route.name}</span>
                      <Badge variant="outline">
                        {SERVICE_CLASS_LABELS[departure.serviceClass]}
                      </Badge>
                      {tripProgress(departure) ? (
                        <Badge variant="secondary">{tripProgress(departure)}</Badge>
                      ) : departure.vehicle && departure.driver ? (
                        <Badge variant="success">Asignada</Badge>
                      ) : (
                        <Badge variant="warning">Por asignar</Badge>
                      )}
                    </div>
                    <span className="text-sm text-muted-foreground">
                      {departure.soldSeats} vendidos · {departure.heldSeats} apartados de{' '}
                      {departure.capacity}
                      {departure.tripId ? (
                        <>
                          {' · '}
                          <Link
                            href={`/portal/organizations/${organization.id}/trips/${departure.tripId}`}
                            className="hover:underline"
                          >
                            Pasajeros
                          </Link>
                        </>
                      ) : null}
                    </span>
                  </div>
                  <ActionForm
                    action={assignTrip}
                    hidden={{
                      organizationId: organization.id,
                      scheduleId: departure.scheduleId,
                      serviceDate: departure.serviceDate,
                    }}
                  >
                    <div className="grid items-end gap-3 sm:grid-cols-[1fr_1fr_auto]">
                      <Field label="Vehículo" htmlFor={`vehicle-${key}`}>
                        <Select
                          id={`vehicle-${key}`}
                          name="vehicleId"
                          defaultValue={departure.vehicle?.id ?? ''}
                        >
                          <option value="">Sin vehículo</option>
                          {vehicles.map((vehicle) => (
                            <option key={vehicle.id} value={vehicle.id}>
                              {vehicleName(vehicle)}
                              {vehicle.documentAlert
                                ? ` · ${DOCUMENT_ALERT_TEXT[vehicle.documentAlert]}`
                                : ''}
                            </option>
                          ))}
                        </Select>
                      </Field>
                      <Field label="Conductor" htmlFor={`driver-${key}`}>
                        <Select
                          id={`driver-${key}`}
                          name="driverUserId"
                          defaultValue={departure.driver?.userId ?? ''}
                        >
                          <option value="">Sin conductor</option>
                          {drivers.map((driver) => (
                            <option key={driver.userId} value={driver.userId}>
                              {driverName(driver)}
                            </option>
                          ))}
                        </Select>
                      </Field>
                      <SubmitButton size="sm" variant="outline">
                        Guardar
                      </SubmitButton>
                    </div>
                  </ActionForm>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </>
  );
}
