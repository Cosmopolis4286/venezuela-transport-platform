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
        // Empty: the API picks the zone from the location.
        ...zoneField(form),
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

/** '' = automatic (omitted), 'none' = no zone, otherwise the zone id. */
function zoneField(form: FormData): { zoneId?: string | null } {
  const zone = text(form, 'zoneId');
  if (!zone) return {};
  return { zoneId: zone === 'none' ? null : zone };
}

export async function setStopZone(_: FormState, form: FormData): Promise<FormState> {
  try {
    await apiRequest(`/admin/stops/${encodeURIComponent(text(form, 'stopId'))}`, {
      method: 'PATCH',
      body: { zoneId: text(form, 'zoneId') === 'none' ? null : text(form, 'zoneId') },
    });
  } catch (error) {
    return failure(error);
  }
  refresh();
  return { success: 'Zona actualizada.' };
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
