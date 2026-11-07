'use server';

import type { AssignTripRequest, CancelDepartureResult } from '@vtp/shared-types';
import { refresh } from 'next/cache';
import type { FormState } from '@/lib/form-state';
import { apiRequest } from '@/lib/server/api';
import { failure, text } from '@/lib/server/form-actions';

// The API checks `operations.dispatch`, the seat map and that nobody is on two trips at once;
// its refusals carry a reason that `failure` turns into Spanish.

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
    return failure(error, {
      VALIDATION_FAILED: 'Elige un conductor del equipo y una fecha de hoy en adelante.',
    });
  }
  refresh();
  return { success: 'Asignación guardada.' };
}

/** Cancels a whole departure: every held booking is released and every paid one refunded. */
export async function cancelDeparture(_: FormState, form: FormData): Promise<FormState> {
  let result: CancelDepartureResult;
  try {
    result = await apiRequest<CancelDepartureResult>(
      `/organizations/${encodeURIComponent(text(form, 'organizationId'))}/dispatch/cancel`,
      {
        method: 'POST',
        body: {
          scheduleId: text(form, 'scheduleId'),
          serviceDate: text(form, 'serviceDate'),
          reason: text(form, 'reason'),
        },
      },
    );
  } catch (error) {
    return failure(error, {
      VALIDATION_FAILED: 'Explica a los pasajeros por qué se cancela (entre 5 y 300 caracteres).',
    });
  }
  refresh();
  return {
    success: `Salida cancelada: ${result.cancelledBookings} reservas canceladas, ${result.refundsDue} por reembolsar.`,
  };
}
