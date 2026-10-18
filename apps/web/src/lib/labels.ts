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
