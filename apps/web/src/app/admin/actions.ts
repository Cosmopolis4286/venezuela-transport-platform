'use server';

import { refresh } from 'next/cache';
import { redirect } from 'next/navigation';
import type { FormState } from '@/lib/form-state';
import { ApiError, apiRequest } from '@/lib/server/api';

// The API restricts these routes to platform staff; the pages also check, for a clear UX.

const text = (form: FormData, name: string) => String(form.get(name) ?? '').trim();

function failure(error: unknown): FormState {
  if (error instanceof ApiError) {
    if (error.status === 401) redirect('/login?expired=1');
    return { error: error.userMessage };
  }
  return { error: 'No pudimos conectar con el servidor. Inténtalo de nuevo.' };
}

export async function reviewOrganization(_: FormState, form: FormData): Promise<FormState> {
  try {
    await apiRequest(
      `/admin/organizations/${encodeURIComponent(text(form, 'organizationId'))}/review`,
      {
        method: 'POST',
        body: { decision: text(form, 'decision'), notes: text(form, 'notes') || undefined },
      },
    );
  } catch (error) {
    return failure(error);
  }
  refresh();
  return { success: 'Decisión registrada.' };
}

export async function reviewApplication(_: FormState, form: FormData): Promise<FormState> {
  const documents = form
    .getAll('documentId')
    .map(String)
    .flatMap((documentId) => {
      const status = text(form, `status:${documentId}`);
      if (status !== 'accepted' && status !== 'rejected') return [];
      return [{ documentId, status, reason: text(form, `reason:${documentId}`) || undefined }];
    });
  const applicationId = text(form, 'applicationId');
  try {
    await apiRequest(`/admin/applications/${encodeURIComponent(applicationId)}/review`, {
      method: 'POST',
      body: {
        decision: text(form, 'decision'),
        notes: text(form, 'notes') || undefined,
        documents,
      },
    });
  } catch (error) {
    return failure(error);
  }
  redirect('/admin?reviewed=1');
}
