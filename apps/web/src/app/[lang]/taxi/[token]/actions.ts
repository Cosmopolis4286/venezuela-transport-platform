'use server';

import { localeFromSegment } from '@vtp/shared-types';
import { refresh } from 'next/cache';
import type { FormState } from '@/lib/form-state';
import { MESSAGES } from '@/i18n/messages';
import { ApiError, apiRequest } from '@/lib/server/api';
import { text } from '@/lib/server/form-actions';

// The tracking link has no account: the token in the URL is what the API checks (ADR-037).

const texts = (form: FormData) => MESSAGES[localeFromSegment(text(form, 'lang')) ?? 'es'].track;

async function call(form: FormData, step: 'cancel' | 'rate', body?: object): Promise<FormState> {
  const t = texts(form);
  try {
    await apiRequest(`/taxi/track/${encodeURIComponent(text(form, 'token'))}/${step}`, {
      method: 'POST',
      auth: false,
      body,
    });
  } catch (error) {
    refresh();
    return { error: error instanceof ApiError && error.status === 409 ? t.changed : t.failed };
  }
  refresh();
  return { success: step === 'cancel' ? t.cancelled_ok : t.thanks };
}

export async function cancelTrackedRide(_: FormState, form: FormData): Promise<FormState> {
  return call(form, 'cancel');
}

export async function rateTrackedRide(_: FormState, form: FormData): Promise<FormState> {
  return call(form, 'rate', {
    rating: Number(text(form, 'rating')),
    comment: text(form, 'comment') || undefined,
  });
}
