import 'server-only';
import { redirect } from 'next/navigation';
import type { ApiErrorCode } from '@vtp/shared-types';
import type { FormState } from '../form-state';
import { ApiError } from './api';

// Helpers for Server Action modules ('use server' files may only export actions).

export const text = (form: FormData, name: string) => String(form.get(name) ?? '').trim();

/**
 * Turns an API error into form state; an expired session goes back to sign-in. `messages`
 * replaces the API's (English) text for codes whose cause the action knows, e.g. a validation rule.
 */
export function failure(
  error: unknown,
  messages: Partial<Record<ApiErrorCode, string>> = {},
): FormState {
  if (error instanceof ApiError) {
    if (error.status === 401) redirect('/login?expired=1');
    return {
      error: (error.code && messages[error.code]) || error.userMessage,
      fieldErrors: Object.fromEntries(error.details.map((d) => [d.field, d.message])),
    };
  }
  return { error: 'No pudimos conectar con el servidor. Inténtalo de nuevo.' };
}
