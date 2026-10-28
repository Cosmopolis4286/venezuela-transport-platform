import {
  SERVICE_CLASS_LABELS,
  longDate,
  todayInVenezuela,
  type OrganizationMembershipSummary,
  type TripSummary,
} from '@vtp/shared-types';
import Link from 'next/link';
import { Suspense } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { assignmentText } from '@/lib/labels';
import { apiFetch } from '@/lib/server/api';

export default function TripsPage({
  params,
  searchParams,
}: PageProps<'/portal/organizations/[organizationId]/trips'>) {
  return (
    <Suspense fallback={<p className="text-muted-foreground">Cargando…</p>}>
      <Trips params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function Trips({
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
  const [{ organization }, trips] = await Promise.all([
    apiFetch<OrganizationMembershipSummary>(base),
    apiFetch<TripSummary[]>(`${base}/trips?date=${date}`),
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
        <h1 className="text-2xl font-semibold">Viajes y pasajeros</h1>
      </div>
      <Card>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="flex flex-col gap-1">
            <CardTitle className="first-letter:uppercase">{longDate(date)}</CardTitle>
            <CardDescription>
              Salidas con reservas, por fecha de salida desde el origen.
            </CardDescription>
          </div>
          <form className="flex gap-2">
            <Input type="date" name="date" defaultValue={date} aria-label="Fecha" />
            <Button type="submit" variant="outline">
              Ver
            </Button>
          </form>
        </div>
        {trips.length === 0 ? (
          <p className="text-sm text-muted-foreground">No hay reservas para ese día.</p>
        ) : (
          <ul className="flex flex-col divide-y">
            {trips.map((trip) => (
              <li key={trip.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      href={`/portal/organizations/${organization.id}/trips/${trip.id}`}
                      className="font-medium tabular-nums hover:underline"
                    >
                      {trip.departureTime} · {trip.route.name}
                    </Link>
                    <Badge variant="outline">{SERVICE_CLASS_LABELS[trip.serviceClass]}</Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {trip.soldSeats} vendidos · {trip.heldSeats} apartados ·{' '}
                    {trip.capacity - trip.soldSeats - trip.heldSeats} libres de {trip.capacity}
                  </p>
                  <p className="text-sm text-muted-foreground">{assignmentText(trip)}</p>
                </div>
                <Button asChild size="sm" variant="outline">
                  <Link href={`/portal/organizations/${organization.id}/trips/${trip.id}`}>
                    Lista de pasajeros
                  </Link>
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
