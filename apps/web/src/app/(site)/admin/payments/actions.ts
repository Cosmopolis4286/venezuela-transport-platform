'use server';

import { refresh } from 'next/cache';
import { PAYMENT_ACCOUNT_FIELDS, PAYMENT_METHODS, type PaymentMethod } from '@vtp/shared-types';
import type { FormState } from '@/lib/form-state';
import { apiRequest } from '@/lib/server/api';
import { failure, text } from '@/lib/server/form-actions';

// The API restricts these routes to platform admins (reviewers get 403).

const methodOf = (form: FormData): PaymentMethod => {
  const method = text(form, 'method') as PaymentMethod;
  if (!PAYMENT_METHODS.includes(method)) throw new Error(`Unknown payment method ${method}`);
  return method;
};

export async function saveAccount(_: FormState, form: FormData): Promise<FormState> {
  const method = methodOf(form);
  const fields = Object.fromEntries(
    PAYMENT_ACCOUNT_FIELDS[method].map(({ key }) => [key, text(form, key)]),
  );
  try {
    await apiRequest(`/admin/payment-accounts/${method}`, {
      method: 'PUT',
      body: { fields, active: form.get('active') === 'on' },
    });
  } catch (error) {
    return failure(error, {
      VALIDATION_FAILED: 'Completa todos los datos de la cuenta (hasta 120 caracteres cada uno).',
    });
  }
  refresh();
  return { success: 'Cuenta guardada.' };
}

export async function removeAccount(_: FormState, form: FormData): Promise<FormState> {
  try {
    await apiRequest(`/admin/payment-accounts/${methodOf(form)}`, { method: 'DELETE' });
  } catch (error) {
    return failure(error, {});
  }
  refresh();
  return { success: 'Cuenta eliminada: ese método ya no se ofrece.' };
}

export async function confirmPayment(_: FormState, form: FormData): Promise<FormState> {
  const receivedAmount = text(form, 'receivedAmount').replace(',', '.');
  try {
    await apiRequest(`/admin/payments/${encodeURIComponent(text(form, 'paymentId'))}/confirm`, {
      method: 'POST',
      body: receivedAmount ? { receivedAmount } : {},
    });
  } catch (error) {
    return failure(error, {
      VALIDATION_FAILED: 'El monto recibido debe ser un número con hasta dos decimales.',
    });
  }
  refresh();
  return { success: 'Pago confirmado.' };
}

export async function rejectPayment(_: FormState, form: FormData): Promise<FormState> {
  try {
    await apiRequest(`/admin/payments/${encodeURIComponent(text(form, 'paymentId'))}/reject`, {
      method: 'POST',
      body: { reason: text(form, 'reason') },
    });
  } catch (error) {
    return failure(error, {
      VALIDATION_FAILED: 'Explica al pasajero por qué (entre 3 y 300 caracteres).',
    });
  }
  refresh();
  return { success: 'Pago rechazado; avisamos al pasajero.' };
}
