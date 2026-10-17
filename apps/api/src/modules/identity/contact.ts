import { parsePhoneNumberFromString } from 'libphonenumber-js';
import type { OtpChannel } from '@vtp/shared-types';

export type ContactKind = 'email' | 'phone';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeEmail(input: string): string | null {
  const value = input.trim().toLowerCase();
  return value.length <= 254 && EMAIL_PATTERN.test(value) ? value : null;
}

/** Parses local Venezuelan numbers (`0412-1234567`) and international ones; returns E.164. */
export function normalizePhone(input: string): string | null {
  const parsed = parsePhoneNumberFromString(input.trim(), 'VE');
  return parsed?.isValid() ? parsed.number : null;
}

export function contactKindFor(channel: OtpChannel): ContactKind {
  return channel === 'email' ? 'email' : 'phone';
}

export function normalizeContact(kind: ContactKind, input: string): string | null {
  return kind === 'email' ? normalizeEmail(input) : normalizePhone(input);
}

/** `+58 *** ***4567` / `j***@gmail.com` — safe to show in UIs and logs. */
export function maskContact(kind: ContactKind, value: string): string {
  if (kind === 'phone') {
    const country = parsePhoneNumberFromString(value)?.countryCallingCode;
    return `${country ? `+${country} ` : ''}*** ***${value.slice(-4)}`;
  }
  const [local = '', domain = ''] = value.split('@');
  return `${local.slice(0, 1)}***@${domain}`;
}
