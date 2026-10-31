'use server';

import { refresh } from 'next/cache';
import type { FormState } from '@/lib/form-state';
import { apiRequest } from '@/lib/server/api';
import { failure, text } from '@/lib/server/form-actions';

// The API restricts these routes to platform admins (reviewers get 403).

const decimal = (form: FormData, name: string) => text(form, name).replace(',', '.');

export async function setCommission(_: FormState, form: FormData): Promise<FormState> {
  const rate = decimal(form, 'rate');
  try {
    await apiRequest(
      `/admin/organizations/${encodeURIComponent(text(form, 'organizationId'))}/commission`,
      { method: 'PUT', body: { rate: rate || null } },
    );
  } catch (error) {
    return failure(error, {
      VALIDATION_FAILED: 'Escribe un porcentaje entre 0 y 100, con hasta dos decimales.',
    });
  }
  refresh();
  return { success: rate ? 'Comisión guardada.' : 'Ahora usa la comisión por defecto.' };
}

export async function createPayout(_: FormState, form: FormData): Promise<FormState> {
  try {
    await apiRequest(
      `/admin/organizations/${encodeURIComponent(text(form, 'organizationId'))}/payouts`,
      {
        method: 'POST',
        body: {
          currency: text(form, 'currency'),
          amount: decimal(form, 'amount'),
          method: text(form, 'method'),
          reference: text(form, 'reference'),
          note: text(form, 'note') || undefined,
        },
      },
    );
  } catch (error) {
    return failure(error, {
      VALIDATION_FAILED:
        'Revisa el pago: un monto mayor que cero con hasta dos decimales y la referencia de la transferencia.',
    });
  }
  refresh();
  return { success: 'Pago registrado.' };
}

export async function voidPayout(_: FormState, form: FormData): Promise<FormState> {
  try {
    await apiRequest(`/admin/payouts/${encodeURIComponent(text(form, 'payoutId'))}/void`, {
      method: 'POST',
      body: { reason: text(form, 'reason') },
    });
  } catch (error) {
    return failure(error, {
      VALIDATION_FAILED: 'Explica en unas palabras por qué se anula el pago.',
    });
  }
  refresh();
  return { success: 'Pago anulado.' };
}

export async function markRefunded(_: FormState, form: FormData): Promise<FormState> {
  try {
    await apiRequest(`/admin/refunds/${encodeURIComponent(text(form, 'paymentId'))}`, {
      method: 'POST',
      body: { reference: text(form, 'reference') },
    });
  } catch (error) {
    return failure(error, {
      VALIDATION_FAILED:
        'Escribe la referencia de la transferencia con la que devolviste el dinero.',
    });
  }
  refresh();
  return { success: 'Reembolso registrado.' };
}
