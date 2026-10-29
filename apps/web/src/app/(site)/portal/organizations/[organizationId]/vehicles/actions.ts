'use server';

import type { VehicleInput } from '@vtp/shared-types';
import { refresh } from 'next/cache';
import type { FormState } from '@/lib/form-state';
import { apiRequest } from '@/lib/server/api';
import { failure, text } from '@/lib/server/form-actions';

// The API checks `fleet.manage` and validates the plate (its message is in Spanish); a repeated
// plate comes back with a reason that `failure` turns into Spanish.

const vehiclesPath = (form: FormData) =>
  `/organizations/${encodeURIComponent(text(form, 'organizationId'))}/vehicles`;

export async function createVehicle(_: FormState, form: FormData): Promise<FormState> {
  const body: VehicleInput = {
    plate: text(form, 'plate'),
    label: text(form, 'label') || null,
    seatLayoutId: text(form, 'seatLayoutId') || null,
  };
  try {
    await apiRequest(vehiclesPath(form), { method: 'POST', body });
  } catch (error) {
    return failure(error);
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
    return failure(error);
  }
  refresh();
  return { success: 'Vehículo guardado.' };
}
