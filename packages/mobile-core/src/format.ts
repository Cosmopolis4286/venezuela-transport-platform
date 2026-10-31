import { DEFAULT_LOCALE, INTL_LOCALES, type Locale } from '@vtp/shared-types';

/** Dates in Caracas time, written the way `locale` reads them. */
export function formatDate(iso: string, locale: Locale = DEFAULT_LOCALE): string {
  return new Intl.DateTimeFormat(INTL_LOCALES[locale], {
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
