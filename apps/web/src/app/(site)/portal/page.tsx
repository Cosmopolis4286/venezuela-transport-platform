import {
  ORGANIZATION_ROLE_LABELS,
  ORGANIZATION_TYPE_LABELS,
  type OrganizationMembershipSummary,
  type ReceivedInvitation,
} from '@vtp/shared-types';
import Link from 'next/link';
import { Suspense } from 'react';
import { ActionForm, SubmitButton } from '@/components/portal/action-form';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardTitle } from '@/components/ui/card';
import { ORGANIZATION_STATUS_LABELS, formatDate, statusVariant } from '@/lib/labels';
import { apiFetch } from '@/lib/server/api';
import { respondToInvitation } from './actions';

export default function PortalHomePage() {
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">Mis organizaciones</h1>
        <Button asChild>
          <Link href="/portal/organizations/new">Registrar organización</Link>
        </Button>
      </div>
      <Suspense fallback={<p className="text-muted-foreground">Cargando…</p>}>
        <Invitations />
        <Organizations />
      </Suspense>
    </>
  );
}

async function Invitations() {
  const invitations = await apiFetch<ReceivedInvitation[]>('/me/invitations');
  if (invitations.length === 0) return null;
  return (
    <Card>
      <CardTitle>Invitaciones pendientes</CardTitle>
      <ul className="flex flex-col divide-y">
        {invitations.map((invitation) => (
          <li
            key={invitation.id}
            className="flex flex-wrap items-center justify-between gap-3 py-3"
          >
            <div>
              <p className="font-medium">
                {invitation.organization.tradeName ?? invitation.organization.legalName}
              </p>
              <p className="text-sm text-muted-foreground">
                {ORGANIZATION_ROLE_LABELS[invitation.role]} · vence{' '}
                {formatDate(invitation.expiresAt)}
              </p>
            </div>
            <ActionForm
              action={respondToInvitation}
              hidden={{ invitationId: invitation.id }}
              className="flex-row"
            >
              <div className="flex gap-2">
                <SubmitButton name="decision" value="accept" size="sm">
                  Aceptar
                </SubmitButton>
                <SubmitButton name="decision" value="decline" size="sm" variant="outline">
                  Rechazar
                </SubmitButton>
              </div>
            </ActionForm>
          </li>
        ))}
      </ul>
    </Card>
  );
}

async function Organizations() {
  const memberships = await apiFetch<OrganizationMembershipSummary[]>('/me/organizations');
  if (memberships.length === 0) {
    return (
      <Card>
        <CardTitle>Aún no perteneces a ninguna organización</CardTitle>
        <CardDescription>
          Registra tu empresa de autobuses, línea de taxis o terminal. Quedará en revisión hasta que
          la administración la apruebe.
        </CardDescription>
      </Card>
    );
  }
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {memberships.map(({ organization, role }) => (
        <Link key={organization.id} href={`/portal/organizations/${organization.id}`} prefetch>
          <Card className="h-full transition-colors hover:bg-accent">
            <div className="flex items-start justify-between gap-3">
              <CardTitle>{organization.tradeName ?? organization.legalName}</CardTitle>
              <Badge variant={statusVariant(organization.status)}>
                {ORGANIZATION_STATUS_LABELS[organization.status]}
              </Badge>
            </div>
            <CardDescription>
              {ORGANIZATION_TYPE_LABELS[organization.type]} · RIF {organization.rif}
            </CardDescription>
            <p className="text-sm">Tu rol: {ORGANIZATION_ROLE_LABELS[role]}</p>
          </Card>
        </Link>
      ))}
    </div>
  );
}
