import { networkClock, vehicleName } from '@vtp/shared-types';

export { APPLICATION_STATUS_LABELS, ORGANIZATION_STATUS_LABELS } from '@vtp/shared-types';

export function statusVariant(status: string): 'success' | 'warning' | 'destructive' | 'secondary' {
  if (status === 'active' || status === 'approved' || status === 'accepted') return 'success';
  if (status === 'rejected' || status === 'suspended' || status === 'declined')
    return 'destructive';
  if (
    status === 'pending_review' ||
    status === 'submitted' ||
    status === 'changes_requested' ||
    status === 'pending'
  )
    return 'warning';
  return 'secondary';
}

export function formatDate(iso: string): string {
  return new Intl.DateTimeFormat('es-VE', {
    dateStyle: 'medium',
    timeZone: 'America/Caracas',
  }).format(new Date(iso));
}

/** "Unidad AB123CD · Conductor: Ana Pérez", or what is still missing. */
export function assignmentText(trip: {
  vehicle: { plate: string; label: string | null } | null;
  driver: { firstName: string | null; lastName: string | null } | null;
}): string {
  const vehicle = trip.vehicle ? `Vehículo ${vehicleName(trip.vehicle)}` : 'Sin vehículo';
  const driver = trip.driver
    ? `Conductor: ${[trip.driver.firstName, trip.driver.lastName].filter(Boolean).join(' ') || 'sin nombre'}`
    : 'sin conductor';
  return `${vehicle} · ${driver}`;
}

/** "En ruta desde las 14:05" / "Llegó 22:40", or null before the driver marks the departure. */
export function tripProgress(trip: {
  departedAt: string | null;
  arrivedAt: string | null;
}): string | null {
  if (trip.arrivedAt) return `Llegó ${networkClock(trip.arrivedAt)}`;
  if (trip.departedAt) return `En ruta desde las ${networkClock(trip.departedAt)}`;
  return null;
}

/** Suffix for a vehicle whose papers need attention. */
export const DOCUMENT_ALERT_TEXT = {
  expired: 'documentos vencidos',
  expiring: 'documentos por vencer',
  valid: '',
} as const;
