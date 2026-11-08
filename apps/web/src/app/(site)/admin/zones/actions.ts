'use server';

import { refresh } from 'next/cache';
import type { FormState } from '@/lib/form-state';
import { apiRequest } from '@/lib/server/api';
import { failure } from '@/lib/server/form-actions';

const text = (form: FormData, name: string) => String(form.get(name) ?? '').trim();
const number = (form: FormData, name: string) => {
  const value = text(form, name).replace(',', '.');
  return value ? Number(value) : null;
};

const messages = {
  VALIDATION_FAILED:
    'Revisa los datos: el identificador va en minúsculas y con guiones, la comisión entre 0 y 100, y el centro (latitud y longitud) va junto con el radio.',
};

/** Fields shared by create and edit. Empty commission = the platform's rate. */
function zoneBody(form: FormData) {
  const commission = text(form, 'commissionRate').replace(',', '.');
  return {
    name: text(form, 'name'),
    slug: text(form, 'slug').toLowerCase(),
    defaultCurrency: text(form, 'defaultCurrency'),
    commissionRate: commission || null,
    latitude: number(form, 'latitude'),
    longitude: number(form, 'longitude'),
    radiusKm: number(form, 'radiusKm'),
  };
}

export async function createZone(_: FormState, form: FormData): Promise<FormState> {
  try {
    await apiRequest('/admin/zones', {
      method: 'POST',
      body: { ...zoneBody(form), status: text(form, 'status') },
    });
  } catch (error) {
    return failure(error, messages);
  }
  refresh();
  return { success: 'Zona creada.' };
}

export async function updateZone(_: FormState, form: FormData): Promise<FormState> {
  try {
    await apiRequest(`/admin/zones/${encodeURIComponent(text(form, 'zoneId'))}`, {
      method: 'PATCH',
      body: zoneBody(form),
    });
  } catch (error) {
    return failure(error, messages);
  }
  refresh();
  return { success: 'Cambios guardados.' };
}

/** The one-click switch: active, coming soon or paused. */
export async function setZoneStatus(_: FormState, form: FormData): Promise<FormState> {
  try {
    await apiRequest(`/admin/zones/${encodeURIComponent(text(form, 'zoneId'))}`, {
      method: 'PATCH',
      body: { status: text(form, 'status') },
    });
  } catch (error) {
    return failure(error, messages);
  }
  refresh();
  return {};
}
