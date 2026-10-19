/** Dates as Venezuelans read them, in Caracas time. */
export function formatDate(iso: string): string {
  return new Intl.DateTimeFormat('es-VE', {
    dateStyle: 'medium',
    timeZone: 'America/Caracas',
  }).format(new Date(iso));
}

/** Badge tone for any status value used by the API. */
export function statusTone(status: string): 'success' | 'warning' | 'danger' | 'neutral' {
  if (status === 'active' || status === 'approved' || status === 'accepted') return 'success';
  if (status === 'rejected' || status === 'suspended' || status === 'declined') return 'danger';
  if (['pending_review', 'submitted', 'changes_requested', 'pending'].includes(status))
    return 'warning';
  return 'neutral';
}
