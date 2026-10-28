'use server';

import type { VehicleInput } from '@vtp/shared-types';
import { refresh } from 'next/cache';
import type { FormState } from '@/lib/form-state';
import { ApiError, apiRequest } from '@/lib/server/api';
import { failure, text } from '@/lib/server/form-actions';

// The API checks `fleet.manage` and validates the plate (its message is in Spanish).

const vehiclesPath = (form: FormData) =>
  `/organizations/${encodeURIComponent(text(form, 'organizationId'))}/vehicles`;

function vehicleFailure(error: unknown): FormState {
  if (error instanceof ApiError && error.code === 'CONFLICT' && /plate/.test(error.message)) {
    return { error: 'Ya tienes un vehículo con esa placa.' };
  }
  return failure(error);
}

export async function createVehicle(_: FormState, form: FormData): Promise<FormState> {
  const body: VehicleInput = {
    plate: text(form, 'plate'),
    label: text(form, 'label') || null,
    seatLayoutId: text(form, 'seatLayoutId') || null,
  };
  try {
    await apiRequest(vehiclesPath(form), { method: 'POST', body });
  } catch (error) {
    return vehicleFailure(error);
  }
  refresh();
  return { success: 'Vehículo agregado.' };
}

export async function updateVehicle(_: FormState, form: FormData): Promise<FormState> {
  const body: Partial<VehicleInput> = {
    label: text(form, 'label') || null,
    seatLayoutId: text(form, 'seatLayoutId') || null,
    active: form.get('active') === 'on',
  };
  try {
    await apiRequest(`${vehiclesPath(form)}/${encodeURIComponent(text(form, 'vehicleId'))}`, {
      method: 'PATCH',
      body,
    });
  } catch (error) {
    return vehicleFailure(error);
  }
  refresh();
  return { success: 'Vehículo guardado.' };
}
