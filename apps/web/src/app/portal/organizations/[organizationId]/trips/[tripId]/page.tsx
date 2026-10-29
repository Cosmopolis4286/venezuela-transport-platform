import {
  BOOKING_STATUS_LABELS,
  SERVICE_CLASS_LABELS,
  longDate,
  networkClock,
  type OrganizationMembershipSummary,
  type TripManifest,
} from '@vtp/shared-types';
import Link from 'next/link';
import { Suspense } from 'react';
import { Badge } from '@/components/ui/badge';
import { Card, CardDescription, CardTitle } from '@/components/ui/card';
import { assignmentText, statusVariant } from '@/lib/labels';
import { apiFetch } from '@/lib/server/api';

export default function ManifestPage({
  params,
}: PageProps<'/portal/organizations/[organizationId]/trips/[tripId]'>) {
  return (
    <Suspense fallback={<p className="text-muted-foreground">Cargando…</p>}>
      <Manifest params={params} />
    </Suspense>
  );
}

async function Manifest({
  params,
}: {
  params: Promise<{ organizationId: string; tripId: string }>;
}) {
  const { organizationId, tripId } = await params;
  const base = `/organizations/${encodeURIComponent(organizationId)}`;
  const [{ organization }, manifest] = await Promise.all([
    apiFetch<OrganizationMembershipSummary>(base),
    apiFetch<TripManifest>(`${base}/trips/${encodeURIComponent(tripId)}/manifest`),
  ]);

  return (
    <>
      <div className="flex flex-col gap-2">
        <Link
          href={`/portal/organizations/${organization.id}/trips?date=${manifest.serviceDate}`}
          className="text-sm text-muted-foreground hover:underline"
        >
          ← Viajes del {longDate(manifest.serviceDate)}
        </Link>
        <h1 className="text-2xl font-semibold tabular-nums">
          {manifest.departureTime} · {manifest.route.name}
        </h1>
        <p className="text-sm text-muted-foreground first-letter:uppercase">
          {longDate(manifest.serviceDate)} · {SERVICE_CLASS_LABELS[manifest.serviceClass]} ·{' '}
          {manifest.soldSeats} vendidos · {manifest.heldSeats} apartados · capacidad{' '}
          {manifest.capacity}
        </p>
        <p className="text-sm text-muted-foreground">{assignmentText(manifest)}</p>
      </div>
      <Card>
        <div className="flex flex-col gap-1">
          <CardTitle>Lista de pasajeros ({manifest.passengers.length})</CardTitle>
          <CardDescription>
            Datos personales: úsalos solo para el abordaje. Las reservas apartadas aún no están
            pagadas; el abordaje se marca al escanear el boleto.
          </CardDescription>
        </div>
        {manifest.passengers.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aún no hay pasajeros.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-muted-foreground">
                <tr>
                  <th className="py-2 pr-3 font-normal">Puesto</th>
                  <th className="py-2 pr-3 font-normal">Pasajero</th>
                  <th className="py-2 pr-3 font-normal">Documento</th>
                  <th className="py-2 pr-3 font-normal">Tramo</th>
                  <th className="py-2 pr-3 font-normal">Reserva</th>
                  <th className="py-2 pr-3 font-normal">Abordaje</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {manifest.passengers.map((p) => (
                  <tr key={`${p.bookingCode}:${p.seatNumber}`}>
                    <td className="py-2 pr-3 font-medium tabular-nums">{p.seatNumber}</td>
                    <td className="py-2 pr-3">
                      {p.firstName} {p.lastName}
                    </td>
                    <td className="py-2 pr-3 tabular-nums">
                      {p.documentType}-{p.documentNumber}
                    </td>
                    <td className="py-2 pr-3">
                      {p.from.city} → {p.to.city}
                    </td>
                    <td className="py-2 pr-3">
                      <span className="mr-2 font-mono text-xs">{p.bookingCode}</span>
                      <Badge
                        variant={statusVariant(p.bookingStatus === 'held' ? 'pending' : 'active')}
                      >
                        {BOOKING_STATUS_LABELS[p.bookingStatus]}
                      </Badge>
                    </td>
                    <td className="py-2 pr-3 tabular-nums">
                      {p.boardedAt ? `Abordó ${networkClock(p.boardedAt)}` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
