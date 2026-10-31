'use server';

import { refresh } from 'next/cache';
import { MAX_REFUND_TIERS, type RefundTier } from '@vtp/shared-types';
import type { FormState } from '@/lib/form-state';
import { apiRequest } from '@/lib/server/api';
import { failure, text } from '@/lib/server/form-actions';

// The API restricts these routes to platform admins (reviewers get 403).

const decimal = (form: FormData, name: string) => text(form, name).replace(',', '.');

/** Tiers typed in rows `tierHours:N` / `tierPercent:N`; empty rows are skipped. */
function tiersFrom(form: FormData): RefundTier[] {
  const tiers: RefundTier[] = [];
  for (let i = 0; i < MAX_REFUND_TIERS; i++) {
    const hours = text(form, `tierHours:${i}`);
    const percent = text(form, `tierPercent:${i}`);
    if (!hours && !percent) continue;
    tiers.push({ hoursBefore: Number(hours), percent: Number(percent) });
  }
  return tiers.sort((a, b) => b.hoursBefore - a.hoursBefore);
}

const POLICY_RULES = {
  VALIDATION_FAILED:
    'Revisa la política: comisión entre 0 y 100 con hasta dos decimales; de 1 a 4 tramos con horas enteras distintas (0 a 720) y porcentajes enteros de 0 a 100.',
};

export async function setPlatformPolicy(_: FormState, form: FormData): Promise<FormState> {
  try {
    await apiRequest('/admin/settlement-policy', {
      method: 'PUT',
      body: { commissionRate: decimal(form, 'commissionRate'), refundTiers: tiersFrom(form) },
    });
  } catch (error) {
    return failure(error, POLICY_RULES);
  }
  refresh();
  return { success: 'Política general guardada. Se aplica desde ahora.' };
}

export async function setOrganizationPolicy(_: FormState, form: FormData): Promise<FormState> {
  const commissionRate = decimal(form, 'commissionRate');
  const ownTiers = form.get('ownTiers') === 'on';
  try {
    await apiRequest(
      `/admin/organizations/${encodeURIComponent(text(form, 'organizationId'))}/policy`,
      {
        method: 'PUT',
        body: {
          commissionRate: commissionRate || null,
          refundTiers: ownTiers ? tiersFrom(form) : null,
        },
      },
    );
  } catch (error) {
    return failure(error, POLICY_RULES);
  }
  refresh();
  return { success: 'Política de la empresa guardada.' };
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
