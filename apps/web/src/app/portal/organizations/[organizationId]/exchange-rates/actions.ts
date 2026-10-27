'use server';

import { RATE_CURRENCIES, type ReplaceExchangeRatesRequest } from '@vtp/shared-types';
import { refresh } from 'next/cache';
import type { FormState } from '@/lib/form-state';
import { apiRequest } from '@/lib/server/api';
import { failure, text } from '@/lib/server/form-actions';

// The API checks `routes.manage`.

const RATE_RULES = {
  VALIDATION_FAILED: 'Revisa las tasas: usa números mayores que cero, con hasta cuatro decimales.',
};

/** Empty fields remove that currency's rate, so passengers cannot pay in it. */
export async function saveExchangeRates(_: FormState, form: FormData): Promise<FormState> {
  const rates: ReplaceExchangeRatesRequest['rates'] = RATE_CURRENCIES.flatMap((currency) => {
    const unitsPerUsd = text(form, `rate:${currency}`).replace(',', '.');
    return unitsPerUsd ? [{ currency, unitsPerUsd }] : [];
  });
  try {
    await apiRequest(
      `/organizations/${encodeURIComponent(text(form, 'organizationId'))}/exchange-rates`,
      { method: 'PUT', body: { rates } },
    );
  } catch (error) {
    return failure(error, RATE_RULES);
  }
  refresh();
  return { success: 'Tasas guardadas.' };
}
