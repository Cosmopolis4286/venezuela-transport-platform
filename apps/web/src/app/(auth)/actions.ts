'use server';

import type { AuthResponse, OtpChallengeResponse } from '@vtp/shared-types';
import { redirect } from 'next/navigation';
import type { FormState } from '@/lib/form-state';
import { safeNextPath } from '@/lib/form-state';
import { ApiError, apiRequest } from '@/lib/server/api';
import { startSession } from '@/lib/server/session';

const text = (form: FormData, name: string) => String(form.get(name) ?? '').trim();

function failure(error: unknown): FormState {
  if (error instanceof ApiError) {
    const fieldErrors = Object.fromEntries(error.details.map((d) => [d.field, d.message]));
    return { error: error.userMessage, fieldErrors };
  }
  return { error: 'No pudimos conectar con el servidor. Inténtalo de nuevo.' };
}

export async function loginWithPassword(_: FormState, form: FormData): Promise<FormState> {
  let response: AuthResponse;
  try {
    response = await apiRequest<AuthResponse>('/auth/login', {
      method: 'POST',
      auth: false,
      body: {
        email: text(form, 'email'),
        password: String(form.get('password') ?? ''),
        client: 'web',
      },
    });
  } catch (error) {
    return failure(error);
  }
  await startSession(response);
  redirect(safeNextPath(form.get('next')));
}

export async function register(_: FormState, form: FormData): Promise<FormState> {
  let response: AuthResponse;
  try {
    response = await apiRequest<AuthResponse>('/auth/register', {
      method: 'POST',
      auth: false,
      body: {
        email: text(form, 'email'),
        password: String(form.get('password') ?? ''),
        firstName: text(form, 'firstName'),
        lastName: text(form, 'lastName'),
        client: 'web',
      },
    });
  } catch (error) {
    return failure(error);
  }
  await startSession(response);
  redirect('/portal');
}

export interface CodeState extends FormState {
  challenge?: OtpChallengeResponse;
}

/** Step 1 of code sign-in: sends the code; step 2 posts the code with the challenge id. */
export async function signInWithCode(state: CodeState, form: FormData): Promise<CodeState> {
  const challengeId = text(form, 'challengeId');
  if (!challengeId) {
    try {
      const challenge = await apiRequest<OtpChallengeResponse>('/auth/otp/request', {
        method: 'POST',
        auth: false,
        body: { channel: text(form, 'channel'), destination: text(form, 'destination') },
      });
      return { challenge };
    } catch (error) {
      return failure(error);
    }
  }

  let response: AuthResponse;
  try {
    response = await apiRequest<AuthResponse>('/auth/otp/verify', {
      method: 'POST',
      auth: false,
      body: { challengeId, code: text(form, 'code'), client: 'web' },
    });
  } catch (error) {
    // Stay on the code step so the user can retry or ask for a new code.
    return { ...failure(error), challenge: state.challenge };
  }
  await startSession(response);
  redirect(safeNextPath(form.get('next')));
}
