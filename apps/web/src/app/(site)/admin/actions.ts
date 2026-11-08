'use server';

import { refresh } from 'next/cache';
import { redirect } from 'next/navigation';
import type { FormState } from '@/lib/form-state';
import { ApiError, apiRequest } from '@/lib/server/api';
import { failure as formFailure } from '@/lib/server/form-actions';

// The API restricts these routes to platform staff; the pages also check, for a clear UX.

const text = (form: FormData, name: string) => String(form.get(name) ?? '').trim();

function failure(error: unknown): FormState {
  if (error instanceof ApiError) {
    if (error.status === 401) redirect('/login?expired=1');
    return { error: error.userMessage };
  }
  return { error: 'No pudimos conectar con el servidor. Inténtalo de nuevo.' };
}

export async function reviewOrganization(_: FormState, form: FormData): Promise<FormState> {
  try {
    await apiRequest(
      `/admin/organizations/${encodeURIComponent(text(form, 'organizationId'))}/review`,
      {
        method: 'POST',
        body: { decision: text(form, 'decision'), notes: text(form, 'notes') || undefined },
      },
    );
  } catch (error) {
    return failure(error);
  }
  refresh();
  return { success: 'Decisión registrada.' };
}

export async function reviewApplication(_: FormState, form: FormData): Promise<FormState> {
  const documents = form
    .getAll('documentId')
    .map(String)
    .flatMap((documentId) => {
      const status = text(form, `status:${documentId}`);
      if (status !== 'accepted' && status !== 'rejected') return [];
      return [{ documentId, status, reason: text(form, `reason:${documentId}`) || undefined }];
    });
  const applicationId = text(form, 'applicationId');
  try {
    await apiRequest(`/admin/applications/${encodeURIComponent(applicationId)}/review`, {
      method: 'POST',
      body: {
        decision: text(form, 'decision'),
        notes: text(form, 'notes') || undefined,
        documents,
      },
    });
  } catch (error) {
    return failure(error);
  }
  redirect('/admin?reviewed=1');
}

const coordinate = (form: FormData, name: string) => {
  const value = text(form, name).replace(',', '.');
  return value ? Number(value) : undefined;
};

export async function createStop(_: FormState, form: FormData): Promise<FormState> {
  try {
    await apiRequest('/admin/stops', {
      method: 'POST',
      body: {
        kind: text(form, 'kind'),
        name: text(form, 'name'),
        city: text(form, 'city'),
        state: text(form, 'state'),
        address: text(form, 'address') || undefined,
        latitude: coordinate(form, 'latitude'),
        longitude: coordinate(form, 'longitude'),
      },
    });
  } catch (error) {
    return formFailure(error, {
      VALIDATION_FAILED:
        'Revisa los datos: nombre, ciudad y estado son obligatorios, y la latitud y la longitud van juntas.',
    });
  }
  refresh();
  return { success: 'Parada agregada al catálogo.' };
}

export async function setStopActive(_: FormState, form: FormData): Promise<FormState> {
  try {
    await apiRequest(`/admin/stops/${encodeURIComponent(text(form, 'stopId'))}`, {
      method: 'PATCH',
      body: { active: text(form, 'active') === 'true' },
    });
  } catch (error) {
    return failure(error);
  }
  refresh();
  return {};
}

const cities = (value: string): { city: string; state: string }[] => {
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? (parsed as { city: string; state: string }[]) : [];
  } catch {
    return [];
  }
};

/** Intercity on/off and closed cities (ADR-029). `closed` is the JSON list to save. */
export async function saveIntercity(_: FormState, form: FormData): Promise<FormState> {
  const closed = cities(text(form, 'closed'));
  const add = text(form, 'addCity');
  if (add) {
    const [city, state] = add.split('|');
    if (city && state) closed.push({ city, state });
  }
  try {
    await apiRequest('/admin/services/intercity', {
      method: 'PUT',
      body: { enabled: text(form, 'enabled') === 'true', closedCities: closed },
    });
  } catch (error) {
    return formFailure(error);
  }
  refresh();
  return { success: 'Servicio entre ciudades actualizado.' };
}

const stopIds = (form: FormData) => form.getAll('stopId').map(String);

export async function createServiceArea(_: FormState, form: FormData): Promise<FormState> {
  try {
    await apiRequest('/admin/service-areas', {
      method: 'POST',
      body: { name: text(form, 'name'), stopIds: stopIds(form) },
    });
  } catch (error) {
    return formFailure(error, {
      VALIDATION_FAILED: 'Escribe el nombre y elige al menos dos paradas.',
    });
  }
  refresh();
  return { success: 'Corredor creado. Está apagado hasta que un administrador lo encienda.' };
}

export async function updateServiceArea(_: FormState, form: FormData): Promise<FormState> {
  const active = text(form, 'active');
  try {
    await apiRequest(`/admin/service-areas/${encodeURIComponent(text(form, 'areaId'))}`, {
      method: 'PATCH',
      body: active
        ? { active: active === 'true' }
        : { name: text(form, 'name'), stopIds: stopIds(form) },
    });
  } catch (error) {
    return formFailure(error, {
      VALIDATION_FAILED: 'Escribe el nombre y elige al menos dos paradas.',
    });
  }
  refresh();
  return { success: active ? undefined : 'Corredor guardado.' };
}
