'use server';

import type { OrganizationMembershipSummary } from '@vtp/shared-types';
import { refresh } from 'next/cache';
import { redirect } from 'next/navigation';
import type { FormState } from '@/lib/form-state';
import { ApiError, apiRequest } from '@/lib/server/api';
import { endSession } from '@/lib/server/session';

// Every action calls the API with the caller's session; the API authorizes each request.

const text = (form: FormData, name: string) => String(form.get(name) ?? '').trim();
const optional = (form: FormData, name: string) => text(form, name) || undefined;

function failure(error: unknown): FormState {
  if (error instanceof ApiError) {
    if (error.status === 401) redirect('/login?expired=1');
    return {
      error: error.userMessage,
      fieldErrors: Object.fromEntries(error.details.map((d) => [d.field, d.message])),
    };
  }
  return { error: 'No pudimos conectar con el servidor. Inténtalo de nuevo.' };
}

export async function logout(): Promise<void> {
  await endSession();
  redirect('/login');
}

export async function createOrganization(_: FormState, form: FormData): Promise<FormState> {
  let created: OrganizationMembershipSummary;
  try {
    created = await apiRequest<OrganizationMembershipSummary>('/organizations', {
      method: 'POST',
      body: {
        type: text(form, 'type'),
        legalName: text(form, 'legalName'),
        tradeName: optional(form, 'tradeName'),
        rif: text(form, 'rif'),
        phone: optional(form, 'phone'),
        email: optional(form, 'email'),
        state: optional(form, 'state'),
        city: optional(form, 'city'),
      },
    });
  } catch (error) {
    return failure(error);
  }
  redirect(`/portal/organizations/${created.organization.id}`);
}

export async function respondToInvitation(_: FormState, form: FormData): Promise<FormState> {
  const decision = text(form, 'decision') === 'accept' ? 'accept' : 'decline';
  try {
    await apiRequest(
      `/me/invitations/${encodeURIComponent(text(form, 'invitationId'))}/${decision}`,
      { method: 'POST' },
    );
  } catch (error) {
    return failure(error);
  }
  refresh();
  return {
    success: decision === 'accept' ? 'Te uniste a la organización.' : 'Invitación rechazada.',
  };
}

export async function inviteMember(_: FormState, form: FormData): Promise<FormState> {
  try {
    await apiRequest(
      `/organizations/${encodeURIComponent(text(form, 'organizationId'))}/invitations`,
      {
        method: 'POST',
        body: {
          contactKind: text(form, 'contactKind'),
          destination: text(form, 'destination'),
          role: text(form, 'role'),
        },
      },
    );
  } catch (error) {
    return failure(error);
  }
  refresh();
  return { success: 'Invitación creada. La persona la verá al iniciar sesión con ese contacto.' };
}

export async function revokeInvitation(_: FormState, form: FormData): Promise<FormState> {
  try {
    await apiRequest(
      `/organizations/${encodeURIComponent(text(form, 'organizationId'))}/invitations/${encodeURIComponent(text(form, 'invitationId'))}`,
      { method: 'DELETE' },
    );
  } catch (error) {
    return failure(error);
  }
  refresh();
  return { success: 'Invitación revocada.' };
}

export async function changeMemberRole(_: FormState, form: FormData): Promise<FormState> {
  try {
    await apiRequest(
      `/organizations/${encodeURIComponent(text(form, 'organizationId'))}/members/${encodeURIComponent(text(form, 'userId'))}`,
      { method: 'PATCH', body: { role: text(form, 'role') } },
    );
  } catch (error) {
    return failure(error);
  }
  refresh();
  return { success: 'Rol actualizado.' };
}

export async function removeMember(_: FormState, form: FormData): Promise<FormState> {
  try {
    await apiRequest(
      `/organizations/${encodeURIComponent(text(form, 'organizationId'))}/members/${encodeURIComponent(text(form, 'userId'))}`,
      { method: 'DELETE' },
    );
  } catch (error) {
    return failure(error);
  }
  refresh();
  return { success: 'Miembro eliminado.' };
}

export async function decideApplicant(_: FormState, form: FormData): Promise<FormState> {
  const decision = text(form, 'decision') === 'accept' ? 'accept' : 'decline';
  try {
    await apiRequest(
      `/organizations/${encodeURIComponent(text(form, 'organizationId'))}/applicants/${encodeURIComponent(text(form, 'applicationId'))}/${decision}`,
      { method: 'POST' },
    );
  } catch (error) {
    return failure(error);
  }
  refresh();
  return { success: decision === 'accept' ? 'Solicitante incorporado.' : 'Solicitud rechazada.' };
}
