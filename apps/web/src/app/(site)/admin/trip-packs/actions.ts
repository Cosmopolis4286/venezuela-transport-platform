'use server';

import { RATE_CURRENCIES, type ReplaceExchangeRatesRequest } from '@vtp/shared-types';
import { refresh } from 'next/cache';
import type { FormState } from '@/lib/form-state';
import { apiRequest } from '@/lib/server/api';
import { failure, text } from '@/lib/server/form-actions';

// The API restricts these routes to platform admins (ADR-028).

const PRODUCT_RULES = {
  VALIDATION_FAILED:
    'Revisa el paquete: dos paradas distintas del corredor, de 2 a 100 viajes, un precio mayor que cero y de 1 a 365 días de vigencia; el tope por viaje, si lo pones, mayor que cero.',
};

export async function createTripPackProduct(_: FormState, form: FormData): Promise<FormState> {
  try {
    await apiRequest('/admin/trip-pack-products', {
      method: 'POST',
      body: {
        serviceAreaId: text(form, 'serviceAreaId'),
        stopIds: [text(form, 'stopA'), text(form, 'stopB')],
        mode: text(form, 'mode'),
        trips: Number(text(form, 'trips')),
        price: text(form, 'price').replace(',', '.'),
        currency: text(form, 'currency'),
        validityDays: Number(text(form, 'validityDays')) || undefined,
        maxFare: text(form, 'maxFare').replace(',', '.') || null,
      },
    });
  } catch (error) {
    return failure(error, PRODUCT_RULES);
  }
  refresh();
  return { success: 'Paquete agregado al catálogo.' };
}

export async function setTripPackProductActive(_: FormState, form: FormData): Promise<FormState> {
  try {
    await apiRequest(`/admin/trip-pack-products/${encodeURIComponent(text(form, 'productId'))}`, {
      method: 'PATCH',
      body: { active: text(form, 'active') === 'true' },
    });
  } catch (error) {
    return failure(error);
  }
  refresh();
  return {};
}

/** The platform's own rates, for packs. Empty fields remove that currency's rate. */
export async function savePlatformRates(_: FormState, form: FormData): Promise<FormState> {
  const rates: ReplaceExchangeRatesRequest['rates'] = RATE_CURRENCIES.flatMap((currency) => {
    const unitsPerUsd = text(form, `rate:${currency}`).replace(',', '.');
    return unitsPerUsd ? [{ currency, unitsPerUsd }] : [];
  });
  try {
    await apiRequest('/admin/exchange-rates', { method: 'PUT', body: { rates } });
  } catch (error) {
    return failure(error, {
      VALIDATION_FAILED: 'Revisa las tasas: números mayores que cero, con hasta cuatro decimales.',
    });
  }
  refresh();
  return { success: 'Tasas de la plataforma guardadas.' };
}
