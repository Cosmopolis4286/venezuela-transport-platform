import {
  EMERGENCY_PHONE,
  TAXI_RIDE_STATUS_LABELS,
  TRANSPORT_MODE_LABELS,
  localPhone,
  type SafetyIncident,
} from '@vtp/shared-types';
import type { Metadata } from 'next';
import { Suspense } from 'react';
import { ActionForm, SubmitButton } from '@/components/portal/action-form';
import { AutoRefresh } from '@/components/portal/auto-refresh';
import { Badge } from '@/components/ui/badge';
import { Card, CardDescription, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/input';
import { formatDateTime } from '@/lib/labels';
import { apiFetch } from '@/lib/server/api';
import { requirePlatformPermission } from '@/lib/server/session';
import { resolveSafetyIncident } from '../actions';

export const metadata: Metadata = { title: 'Emergencias' };

export default function SafetyPage() {
  return (
    <Suspense fallback={<p className="text-muted-foreground">Cargando…</p>}>
      <Safety />
    </Suspense>
  );
}

/** Emergency alerts (SOS) from taxi and motorcycle rides (ADR-043): open ones first. */
async function Safety() {
  await requirePlatformPermission('safety.manage');
  const incidents = await apiFetch<SafetyIncident[]>('/admin/safety-incidents');
  const open = incidents.filter((i) => !i.resolvedAt);
  return (
    <>
      <AutoRefresh seconds={20} />
      <h1 className="text-2xl font-semibold">Emergencias</h1>
      <p className="text-sm text-muted-foreground">
        Alertas del botón de Emergencia de pasajeros y conductores. Llama primero a quien la envió;
        si hay riesgo, al {EMERGENCY_PHONE} con la placa y la ubicación. Al terminar, escribe qué
        hiciste. La página se actualiza sola.
      </p>
      {incidents.length === 0 ? (
        <p className="text-sm text-muted-foreground">No hay alertas.</p>
      ) : null}
      {incidents.map((incident) => (
        <IncidentCard key={incident.id} incident={incident} />
      ))}
      {open.length === 0 && incidents.length > 0 ? (
        <p className="text-sm text-muted-foreground">Todas las alertas están atendidas.</p>
      ) : null}
    </>
  );
}

function IncidentCard({ incident }: { incident: SafetyIncident }) {
  const { ride } = incident;
  const person = (p: { name: string; phone: string | null } | null) =>
    p ? `${p.name}${p.phone ? ` · ${localPhone(p.phone)}` : ''}` : '—';
  return (
    <Card className={incident.resolvedAt ? undefined : 'border-destructive'}>
      <div className="flex flex-wrap items-center gap-2">
        <CardTitle>
          {incident.reporterRole === 'driver' ? 'El conductor' : 'El pasajero'} pidió ayuda
        </CardTitle>
        <Badge variant={incident.resolvedAt ? 'secondary' : 'destructive'}>
          {incident.resolvedAt ? 'Atendida' : 'Abierta'}
        </Badge>
        <span className="text-sm text-muted-foreground">{formatDateTime(incident.createdAt)}</span>
      </div>
      <CardDescription>
        {TRANSPORT_MODE_LABELS[ride.mode]} {ride.plate ?? ''} · {ride.route} ·{' '}
        {TAXI_RIDE_STATUS_LABELS[ride.status]}
        {ride.line ? ` · ${ride.line}` : ''}
      </CardDescription>
      <dl className="grid gap-2 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-muted-foreground">Pasajero</dt>
          <dd>{person(ride.passenger)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Conductor</dt>
          <dd>{person(ride.driver)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Dirección del viaje</dt>
          <dd>{ride.address}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Ubicación al pedir ayuda</dt>
          <dd>
            {incident.location ? (
              <a
                href={`https://www.google.com/maps/search/?api=1&query=${incident.location.latitude},${incident.location.longitude}`}
                target="_blank"
                rel="noreferrer"
                className="underline"
              >
                Ver en el mapa
              </a>
            ) : (
              'El teléfono del conductor no la compartía'
            )}
          </dd>
        </div>
      </dl>
      {incident.resolvedAt ? (
        <p className="text-sm">
          Atendida {formatDateTime(incident.resolvedAt)}: {incident.resolvedNotes}
        </p>
      ) : (
        <ActionForm action={resolveSafetyIncident} hidden={{ incidentId: incident.id }}>
          <Textarea name="notes" placeholder="Qué hiciste (obligatorio)" required minLength={3} />
          <div>
            <SubmitButton size="sm">Marcar como atendida</SubmitButton>
          </div>
        </ActionForm>
      )}
    </Card>
  );
}
