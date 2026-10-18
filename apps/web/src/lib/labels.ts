import type { ApplicationStatus, OrganizationStatus } from '@vtp/shared-types';

export const ORGANIZATION_STATUS_LABELS: Record<OrganizationStatus, string> = {
  pending_review: 'En revisión',
  active: 'Activa',
  suspended: 'Suspendida',
  rejected: 'Rechazada',
};

export const APPLICATION_STATUS_LABELS: Record<ApplicationStatus, string> = {
  draft: 'Borrador',
  submitted: 'Enviada',
  changes_requested: 'Requiere cambios',
  approved: 'Aprobada',
  rejected: 'Rechazada',
};

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
