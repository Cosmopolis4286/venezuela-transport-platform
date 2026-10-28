'use server';

import type { AssignTripRequest } from '@vtp/shared-types';
import { refresh } from 'next/cache';
import type { FormState } from '@/lib/form-state';
import { ApiError, apiRequest } from '@/lib/server/api';
import { failure, text } from '@/lib/server/form-actions';

// The API checks `operations.dispatch`, the seat map and that nobody is on two trips at once.

const CONFLICTS: [RegExp, string][] = [
  [/vehicle is on another trip/, 'Ese vehículo ya está en otro viaje a esa hora.'],
  [/driver is on another trip/, 'Ese conductor ya está en otro viaje a esa hora.'],
  [/seat map/, 'Ese vehículo tiene otro mapa de puestos que esta salida.'],
  [/inactive/, 'Ese vehículo está inactivo.'],
  [/cancelled/, 'Esta salida está cancelada.'],
];

export async function assignTrip(_: FormState, form: FormData): Promise<FormState> {
  const body: AssignTripRequest = {
    scheduleId: text(form, 'scheduleId'),
    serviceDate: text(form, 'serviceDate'),
    vehicleId: text(form, 'vehicleId') || null,
    driverUserId: text(form, 'driverUserId') || null,
  };
  try {
    await apiRequest(
      `/organizations/${encodeURIComponent(text(form, 'organizationId'))}/dispatch/assignment`,
      { method: 'PUT', body },
    );
  } catch (error) {
    if (error instanceof ApiError && error.code === 'CONFLICT') {
      const known = CONFLICTS.find(([pattern]) => pattern.test(error.message));
      if (known) return { error: known[1] };
    }
    return failure(error, {
      VALIDATION_FAILED: 'Elige un conductor del equipo y una fecha de hoy en adelante.',
    });
  }
  refresh();
  return { success: 'Asignación guardada.' };
}
