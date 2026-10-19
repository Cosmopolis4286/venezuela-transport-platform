'use server';

import type { Fare, Route } from '@vtp/shared-types';
import { refresh } from 'next/cache';
import { redirect } from 'next/navigation';
import type { FormState } from '@/lib/form-state';
import { apiRequest } from '@/lib/server/api';
import { failure, text } from '@/lib/server/form-actions';

// Every action calls the API with the caller's session; the API checks `routes.manage`.

const ROUTE_RULES = {
  VALIDATION_FAILED:
    'Revisa el recorrido: elige paradas activas sin repetir, y cada parada debe tener más tiempo desde el origen que la anterior.',
};
const STATUS_RULES = {
  CONFLICT:
    'Para publicar la ruta necesitas al menos un horario activo, el precio del origen al destino final y que la organización esté aprobada.',
};
const FARE_RULES = {
  VALIDATION_FAILED: 'Revisa los precios: usa números mayores que cero, con hasta dos decimales.',
};
const SCHEDULE_RULES = {
  VALIDATION_FAILED:
    'Revisa el horario: indica la hora, al menos un día, entre 1 y 100 puestos y que la fecha final no sea anterior a la inicial.',
  CONFLICT: 'Esta ruta ya tiene el máximo de horarios.',
};

const routesPath = (form: FormData) =>
  `/organizations/${encodeURIComponent(text(form, 'organizationId'))}/routes`;
const routePath = (form: FormData) =>
  `${routesPath(form)}/${encodeURIComponent(text(form, 'routeId'))}`;

/** Ordered stops from the route editor: parallel stopId / hours / minutes fields. */
function routeBody(form: FormData) {
  const hours = form.getAll('hours').map(Number);
  const minutes = form.getAll('minutes').map(Number);
  return {
    name: text(form, 'name'),
    stops: form
      .getAll('stopId')
      .map(String)
      .map((stopId, index) => ({
        stopId,
        minutesFromOrigin: (hours[index] || 0) * 60 + (minutes[index] || 0),
      })),
  };
}

export async function createRoute(_: FormState, form: FormData): Promise<FormState> {
  let route: Route;
  try {
    route = await apiRequest<Route>(routesPath(form), { method: 'POST', body: routeBody(form) });
  } catch (error) {
    return failure(error, ROUTE_RULES);
  }
  redirect(`/portal/organizations/${route.organizationId}/routes/${route.id}`);
}

export async function updateRoute(_: FormState, form: FormData): Promise<FormState> {
  try {
    await apiRequest(routePath(form), { method: 'PATCH', body: routeBody(form) });
  } catch (error) {
    return failure(error, ROUTE_RULES);
  }
  refresh();
  return { success: 'Recorrido guardado.' };
}

export async function changeRouteStatus(_: FormState, form: FormData): Promise<FormState> {
  const status = text(form, 'status');
  try {
    await apiRequest(`${routePath(form)}/status`, { method: 'POST', body: { status } });
  } catch (error) {
    return failure(error, STATUS_RULES);
  }
  refresh();
  return { success: status === 'active' ? 'Ruta publicada.' : 'Ruta desactivada.' };
}

export async function deleteRoute(_: FormState, form: FormData): Promise<FormState> {
  try {
    await apiRequest(routePath(form), { method: 'DELETE' });
  } catch (error) {
    return failure(error, { CONFLICT: 'Solo se pueden eliminar borradores; desactiva la ruta.' });
  }
  redirect(`/portal/organizations/${text(form, 'organizationId')}`);
}

/** One row per pair of stops: `amount:<from>:<to>` and `currency:<from>:<to>`; empty = no fare. */
export async function saveFares(_: FormState, form: FormData): Promise<FormState> {
  const fares: Fare[] = form.getAll('pair').flatMap((value) => {
    const [fromStopId, toStopId] = String(value).split(':');
    const amount = text(form, `amount:${value}`).replace(',', '.');
    if (!fromStopId || !toStopId || !amount) return [];
    return [
      {
        fromStopId,
        toStopId,
        amount,
        currency: text(form, `currency:${value}`) as Fare['currency'],
      },
    ];
  });
  try {
    await apiRequest(`${routePath(form)}/fares`, { method: 'PUT', body: { fares } });
  } catch (error) {
    return failure(error, FARE_RULES);
  }
  refresh();
  return { success: 'Precios guardados.' };
}

export async function addSchedule(_: FormState, form: FormData): Promise<FormState> {
  try {
    await apiRequest(`${routePath(form)}/schedules`, {
      method: 'POST',
      body: {
        departureTime: text(form, 'departureTime'),
        daysOfWeek: form.getAll('day').map(Number),
        validFrom: text(form, 'validFrom'),
        validUntil: text(form, 'validUntil') || null,
        serviceClass: text(form, 'serviceClass'),
        seats: Number(text(form, 'seats')),
      },
    });
  } catch (error) {
    return failure(error, SCHEDULE_RULES);
  }
  refresh();
  return { success: 'Horario agregado.' };
}

export async function setScheduleActive(_: FormState, form: FormData): Promise<FormState> {
  try {
    await apiRequest(
      `${routePath(form)}/schedules/${encodeURIComponent(text(form, 'scheduleId'))}`,
      { method: 'PATCH', body: { active: text(form, 'active') === 'true' } },
    );
  } catch (error) {
    return failure(error);
  }
  refresh();
  return {};
}

export async function deleteSchedule(_: FormState, form: FormData): Promise<FormState> {
  try {
    await apiRequest(
      `${routePath(form)}/schedules/${encodeURIComponent(text(form, 'scheduleId'))}`,
      { method: 'DELETE' },
    );
  } catch (error) {
    return failure(error);
  }
  refresh();
  return {};
}
