'use server';

import type { SeatLayout, SeatLayoutInput } from '@vtp/shared-types';
import { refresh } from 'next/cache';
import { redirect } from 'next/navigation';
import type { FormState } from '@/lib/form-state';
import { apiRequest } from '@/lib/server/api';
import { failure, text } from '@/lib/server/form-actions';

// The API checks `fleet.manage` and validates the whole layout (its messages are in Spanish).

const layoutsPath = (form: FormData) =>
  `/organizations/${encodeURIComponent(text(form, 'organizationId'))}/seat-layouts`;

/** The editor's JSON, reduced to the fields the API accepts (it rejects unknown ones). */
function layoutBody(form: FormData): SeatLayoutInput | null {
  try {
    const { name, decks, rows, columns, seats } = JSON.parse(
      text(form, 'layout'),
    ) as SeatLayoutInput;
    return {
      name,
      decks,
      rows,
      columns,
      seats: seats.map(({ number, deck, row, column }) => ({ number, deck, row, column })),
    };
  } catch {
    return null;
  }
}

export async function createSeatLayout(_: FormState, form: FormData): Promise<FormState> {
  const body = layoutBody(form);
  if (!body) return { error: 'No pudimos leer el plano. Recarga la página.' };
  let layout: SeatLayout;
  try {
    layout = await apiRequest<SeatLayout>(layoutsPath(form), { method: 'POST', body });
  } catch (error) {
    return failure(error);
  }
  redirect(`/portal/organizations/${layout.organizationId}/seat-layouts/${layout.id}`);
}

export async function updateSeatLayout(_: FormState, form: FormData): Promise<FormState> {
  const body = layoutBody(form);
  if (!body) return { error: 'No pudimos leer el plano. Recarga la página.' };
  try {
    await apiRequest(`${layoutsPath(form)}/${encodeURIComponent(text(form, 'layoutId'))}`, {
      method: 'PATCH',
      body,
    });
  } catch (error) {
    return failure(error);
  }
  refresh();
  return { success: 'Plano guardado. Los horarios que lo usan tienen ahora esta capacidad.' };
}

export async function deleteSeatLayout(_: FormState, form: FormData): Promise<FormState> {
  try {
    await apiRequest(`${layoutsPath(form)}/${encodeURIComponent(text(form, 'layoutId'))}`, {
      method: 'DELETE',
    });
  } catch (error) {
    return failure(error, {
      CONFLICT: 'Hay horarios usando este plano. Cámbialos a otro plano antes de eliminarlo.',
    });
  }
  redirect(`/portal/organizations/${text(form, 'organizationId')}`);
}
