'use server';

import { refresh } from 'next/cache';
import type { FormState } from '@/lib/form-state';
import { apiRequest } from '@/lib/server/api';
import { failure, text } from '@/lib/server/form-actions';

/** A taxi or motorcycle line the platform runs for independent drivers (ADR-039). */
export async function createIndependentLine(_: FormState, form: FormData): Promise<FormState> {
  try {
    await apiRequest('/admin/independent-lines', {
      method: 'POST',
      body: {
        type: text(form, 'type'),
        legalName: text(form, 'legalName'),
        tradeName: text(form, 'tradeName') || undefined,
        rif: text(form, 'rif'),
      },
    });
  } catch (error) {
    return failure(error, {
      VALIDATION_FAILED: 'Revisa los datos: tipo, razón social y RIF (J-12345678-9).',
    });
  }
  refresh();
  return {
    success:
      'Línea creada y activa. Eres su dueña o dueño: invita a tu equipo desde su página en el portal.',
  };
}
