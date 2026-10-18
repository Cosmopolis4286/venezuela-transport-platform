import type { IdentityDocumentType } from '@vtp/shared-types';

/** Strips separators: `V-12.345.678` → `12345678`; passports are upper-cased. */
export function normalizeDocumentNumber(type: IdentityDocumentType, input: string): string | null {
  const value = input.toUpperCase().replace(/[\s.-]/g, '');
  if (type === 'P') return /^[A-Z0-9]{6,12}$/.test(value) ? value : null;
  const digits = value.replace(/^[VE]/, '');
  return /^\d{6,9}$/.test(digits) ? digits : null;
}

/** Venezuelan plates (`AB123CD`, `ABC12D`, …) without spaces or dashes. */
export function normalizePlate(input: string): string | null {
  const value = input.toUpperCase().replace(/[\s-]/g, '');
  return /^[A-Z0-9]{5,8}$/.test(value) ? value : null;
}

/** Whole years between an ISO date (YYYY-MM-DD) and `today`. */
export function ageOn(birthDate: string, today = new Date()): number {
  const [year, month, day] = birthDate.split('-').map(Number) as [number, number, number];
  let age = today.getUTCFullYear() - year;
  const beforeBirthday =
    today.getUTCMonth() + 1 < month ||
    (today.getUTCMonth() + 1 === month && today.getUTCDate() < day);
  if (beforeBirthday) age -= 1;
  return age;
}

/** Keeps a displayable, harmless file name (no paths, control characters or huge strings). */
export function sanitizeFileName(input: string): string {
  const base = input.split(/[\\/]/).pop() ?? '';
  // Control characters are matched on purpose: they must never reach headers or UIs.
  // eslint-disable-next-line no-control-regex
  const clean = base.replace(/[\u0000-\u001f\u007f"<>]/g, '').trim();
  return (clean || 'documento').slice(0, 120);
}
