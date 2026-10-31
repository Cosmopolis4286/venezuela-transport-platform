import { todayInVenezuela } from '@vtp/shared-types';

/** `?month=2026-10` from the URL, or the current Venezuelan month. */
export function monthParam(raw: string | string[] | undefined): string {
  return typeof raw === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(raw)
    ? raw
    : todayInVenezuela().slice(0, 7);
}
