'use server';

import type {
  AssignTaxiRideRequest,
  Currency,
  OnDemandMode,
  ReplaceOnDemandFaresRequest,
} from '@vtp/shared-types';
import { refresh } from 'next/cache';
import type { FormState } from '@/lib/form-state';
import { apiRequest } from '@/lib/server/api';
import { failure, text } from '@/lib/server/form-actions';

// The API checks `routes.manage` for the terminals and `operations.dispatch` for rides.

const taxiPath = (form: FormData) =>
  `/organizations/${encodeURIComponent(text(form, 'organizationId'))}/taxi`;

function taxiFailure(error: unknown): FormState {
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
  // Stretch rides have no fare fields: the line's fixed fare for the stretch applies.
  const fareAmount = text(form, 'fareAmount').replace(',', '.');
  const body: AssignTaxiRideRequest = {
    driverUserId: text(form, 'driverUserId'),
    vehicleId: text(form, 'vehicleId'),
    ...(fareAmount ? { fareAmount, fareCurrency: text(form, 'fareCurrency') as Currency } : {}),
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

/** Rows `a:N`, `b:N`, `amount:N`, `currency:N`; a row without both stops and an amount is dropped. */
export async function saveStretchFares(_: FormState, form: FormData): Promise<FormState> {
  const mode = text(form, 'mode') as OnDemandMode;
  const fares: ReplaceOnDemandFaresRequest['fares'] = [];
  for (let i = 0; form.has(`a:${i}`); i++) {
    const a = text(form, `a:${i}`);
    const b = text(form, `b:${i}`);
    const amount = text(form, `amount:${i}`).replace(',', '.');
    if (!a || !b || !amount) continue;
    fares.push({
      stopIds: [a, b],
      mode,
      amount,
      currency: text(form, `currency:${i}`) as Currency,
    });
  }
  try {
    await apiRequest(`${taxiPath(form)}/stretch-fares`, { method: 'PUT', body: { fares } });
  } catch (error) {
    return failure(error, {
      VALIDATION_FAILED:
        'Revisa las tarifas: dos paradas distintas, montos mayores que cero con hasta dos decimales, y un solo monto por tramo.',
    });
  }
  refresh();
  return { success: 'Tarifas guardadas.' };
}
