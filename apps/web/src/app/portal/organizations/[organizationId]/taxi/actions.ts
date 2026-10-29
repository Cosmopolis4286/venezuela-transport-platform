'use server';

import type { AssignTaxiRideRequest, Currency } from '@vtp/shared-types';
import { refresh } from 'next/cache';
import type { FormState } from '@/lib/form-state';
import { ApiError, apiRequest } from '@/lib/server/api';
import { failure, text } from '@/lib/server/form-actions';

// The API checks `routes.manage` for the terminals and `operations.dispatch` for rides.

const taxiPath = (form: FormData) =>
  `/organizations/${encodeURIComponent(text(form, 'organizationId'))}/taxi`;

const CONFLICTS: [RegExp, string][] = [
  [/driver is already/, 'Ese conductor ya está en otro viaje.'],
  [/vehicle is already/, 'Ese vehículo ya está en otro viaje.'],
  [/already taken|no longer open/, 'Otro taxi tomó la solicitud, o ya venció.'],
  [/inactive/, 'Ese vehículo está inactivo.'],
  [/Only an accepted/, 'Solo se puede liberar un viaje que aún no ha empezado.'],
];

function taxiFailure(error: unknown): FormState {
  if (error instanceof ApiError && error.code === 'CONFLICT') {
    const known = CONFLICTS.find(([pattern]) => pattern.test(error.message));
    if (known) return { error: known[1] };
  }
  return failure(error, {
    VALIDATION_FAILED: 'Revisa los datos: elige un conductor y escribe una tarifa mayor que cero.',
  });
}

export async function saveTaxiTerminals(_: FormState, form: FormData): Promise<FormState> {
  const stopIds = form.getAll('stopId').map(String);
  try {
    await apiRequest(`${taxiPath(form)}/terminals`, { method: 'PUT', body: { stopIds } });
  } catch (error) {
    return failure(error);
  }
  refresh();
  return { success: 'Terminales guardados.' };
}

export async function assignTaxiRide(_: FormState, form: FormData): Promise<FormState> {
  const body: AssignTaxiRideRequest = {
    driverUserId: text(form, 'driverUserId'),
    vehicleId: text(form, 'vehicleId'),
    fareAmount: text(form, 'fareAmount').replace(',', '.'),
    fareCurrency: text(form, 'fareCurrency') as Currency,
  };
  try {
    await apiRequest(`${taxiPath(form)}/rides/${encodeURIComponent(text(form, 'rideId'))}/assign`, {
      method: 'POST',
      body,
    });
  } catch (error) {
    return taxiFailure(error);
  }
  refresh();
  return { success: 'Taxi asignado.' };
}

export async function releaseTaxiRide(_: FormState, form: FormData): Promise<FormState> {
  try {
    await apiRequest(
      `${taxiPath(form)}/rides/${encodeURIComponent(text(form, 'rideId'))}/release`,
      { method: 'POST' },
    );
  } catch (error) {
    return taxiFailure(error);
  }
  refresh();
  return { success: 'Viaje liberado: vuelve a las solicitudes.' };
}
