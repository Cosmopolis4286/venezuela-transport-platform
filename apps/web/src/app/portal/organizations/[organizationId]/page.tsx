import {
  ORGANIZATION_ROLE_LABELS,
  ORGANIZATION_TYPE_LABELS,
  ROLES_BY_ORGANIZATION_TYPE,
  type OrganizationApplicant,
  type OrganizationInvitation,
  type OrganizationMember,
  type OrganizationMembershipSummary,
  type OrganizationType,
} from '@vtp/shared-types';
import Link from 'next/link';
import { Suspense } from 'react';
import { ActionForm, SubmitButton } from '@/components/portal/action-form';
import { Badge } from '@/components/ui/badge';
import { Card, CardDescription, CardTitle } from '@/components/ui/card';
import { Input, Select } from '@/components/ui/input';
import { Field } from '@/components/ui/label';
import { ORGANIZATION_STATUS_LABELS, formatDate, statusVariant } from '@/lib/labels';
import { apiFetch } from '@/lib/server/api';
import {
  changeMemberRole,
  decideApplicant,
  inviteMember,
  removeMember,
  revokeInvitation,
} from '../../actions';

export default function OrganizationPage({
  params,
}: PageProps<'/portal/organizations/[organizationId]'>) {
  return (
    <Suspense fallback={<p className="text-muted-foreground">Cargando…</p>}>
      <Organization params={params} />
    </Suspense>
  );
}

async function Organization({ params }: { params: Promise<{ organizationId: string }> }) {
  const { organizationId } = await params;
  const id = encodeURIComponent(organizationId);
  const { organization, role, permissions } = await apiFetch<OrganizationMembershipSummary>(
    `/organizations/${id}`,
  );
  const canViewMembers = permissions.includes('members.view');
  const canManage = permissions.includes('members.manage');

  return (
    <>
      <div className="flex flex-col gap-2">
        <Link href="/portal" className="text-sm text-muted-foreground hover:underline">
          ← Mis organizaciones
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold">
            {organization.tradeName ?? organization.legalName}
          </h1>
          <Badge variant={statusVariant(organization.status)}>
            {ORGANIZATION_STATUS_LABELS[organization.status]}
          </Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          {ORGANIZATION_TYPE_LABELS[organization.type]} · {organization.legalName} · RIF{' '}
          {organization.rif}
          {organization.city ? ` · ${organization.city}` : ''} · Tu rol:{' '}
          {ORGANIZATION_ROLE_LABELS[role]}
        </p>
        {organization.status === 'pending_review' ? (
          <p className="text-sm text-muted-foreground">
            La administración está revisando esta organización. Mientras tanto puedes invitar a tu
            equipo.
          </p>
        ) : null}
      </div>

      {canViewMembers ? (
        <Members
          organizationId={organization.id}
          type={organization.type}
          canManage={canManage}
          myRole={role}
        />
      ) : null}
      {canManage ? (
        <>
          <Invite
            organizationId={organization.id}
            type={organization.type}
            isOwner={role === 'owner'}
          />
          <Applicants organizationId={organization.id} />
        </>
      ) : null}
      {!canViewMembers ? (
        <Card>
          <CardDescription>
            Tu rol no permite gestionar el equipo de esta organización.
          </CardDescription>
        </Card>
      ) : null}
    </>
  );
}

function roleOptions(type: OrganizationType, includeOwner: boolean) {
  return ROLES_BY_ORGANIZATION_TYPE[type].filter((r) => includeOwner || r !== 'owner');
}

async function Members({
  organizationId,
  type,
  canManage,
  myRole,
}: {
  organizationId: string;
  type: OrganizationType;
  canManage: boolean;
  myRole: string;
}) {
  const members = await apiFetch<OrganizationMember[]>(`/organizations/${organizationId}/members`);
  const isOwner = myRole === 'owner';
  return (
    <Card>
      <CardTitle>Equipo ({members.length})</CardTitle>
      <ul className="flex flex-col divide-y">
        {members.map((member) => {
          const name =
            [member.firstName, member.lastName].filter(Boolean).join(' ') ||
            member.email ||
            member.phone ||
            'Sin nombre';
          const editable = canManage && (isOwner || member.role !== 'owner');
          return (
            <li
              key={member.userId}
              className="flex flex-wrap items-center justify-between gap-3 py-3"
            >
              <div>
                <p className="font-medium">{name}</p>
                <p className="text-sm text-muted-foreground">
                  {[member.email, member.phone].filter(Boolean).join(' · ')} · desde{' '}
                  {formatDate(member.joinedAt)}
                </p>
              </div>
              {editable ? (
                <div className="flex flex-wrap items-start gap-2">
                  <ActionForm
                    action={changeMemberRole}
                    hidden={{ organizationId, userId: member.userId }}
                    className="flex-row"
                  >
                    <div className="flex gap-2">
                      <Select
                        name="role"
                        defaultValue={member.role}
                        aria-label="Rol"
                        className="w-44"
                      >
                        {roleOptions(type, isOwner).map((r) => (
                          <option key={r} value={r}>
                            {ORGANIZATION_ROLE_LABELS[r]}
                          </option>
                        ))}
                      </Select>
                      <SubmitButton size="sm" variant="outline">
                        Cambiar
                      </SubmitButton>
                    </div>
                  </ActionForm>
                  <ActionForm
                    action={removeMember}
                    hidden={{ organizationId, userId: member.userId }}
                  >
                    <SubmitButton size="sm" variant="ghost">
                      Quitar
                    </SubmitButton>
                  </ActionForm>
                </div>
              ) : (
                <Badge variant="outline">{ORGANIZATION_ROLE_LABELS[member.role]}</Badge>
              )}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

async function Invite({
  organizationId,
  type,
  isOwner,
}: {
  organizationId: string;
  type: OrganizationType;
  isOwner: boolean;
}) {
  const invitations = await apiFetch<OrganizationInvitation[]>(
    `/organizations/${organizationId}/invitations`,
  );
  const pending = invitations.filter((i) => i.status === 'pending');
  return (
    <Card>
      <div className="flex flex-col gap-1">
        <CardTitle>Invitar</CardTitle>
        <CardDescription>
          La persona verá la invitación al iniciar sesión con ese correo o teléfono. Vence en 7
          días.
        </CardDescription>
      </div>
      <ActionForm action={inviteMember} hidden={{ organizationId }}>
        <div className="grid gap-3 sm:grid-cols-[10rem_1fr_12rem_auto] sm:items-end">
          <Field label="Por" htmlFor="contactKind">
            <Select id="contactKind" name="contactKind" defaultValue="phone">
              <option value="phone">Teléfono</option>
              <option value="email">Correo</option>
            </Select>
          </Field>
          <Field label="Teléfono o correo" htmlFor="destination">
            <Input id="destination" name="destination" required placeholder="0414-1234567" />
          </Field>
          <Field label="Rol" htmlFor="role">
            <Select
              id="role"
              name="role"
              defaultValue={type === 'terminal' ? 'inspector' : 'driver'}
            >
              {roleOptions(type, isOwner).map((r) => (
                <option key={r} value={r}>
                  {ORGANIZATION_ROLE_LABELS[r]}
                </option>
              ))}
            </Select>
          </Field>
          <SubmitButton>Invitar</SubmitButton>
        </div>
      </ActionForm>
      {pending.length > 0 ? (
        <ul className="flex flex-col divide-y border-t">
          {pending.map((invitation) => (
            <li
              key={invitation.id}
              className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm"
            >
              <span>
                {invitation.destination} · {ORGANIZATION_ROLE_LABELS[invitation.role]} · vence{' '}
                {formatDate(invitation.expiresAt)}
              </span>
              <ActionForm
                action={revokeInvitation}
                hidden={{ organizationId, invitationId: invitation.id }}
              >
                <SubmitButton size="sm" variant="ghost">
                  Revocar
                </SubmitButton>
              </ActionForm>
            </li>
          ))}
        </ul>
      ) : null}
    </Card>
  );
}

async function Applicants({ organizationId }: { organizationId: string }) {
  const applicants = await apiFetch<OrganizationApplicant[]>(
    `/organizations/${organizationId}/applicants`,
  );
  const pending = applicants.filter((a) => a.decision === 'pending');
  return (
    <Card>
      <div className="flex flex-col gap-1">
        <CardTitle>Solicitantes verificados ({pending.length})</CardTitle>
        <CardDescription>
          Personas aprobadas por la administración (KYC) que pidieron unirse a esta organización.
        </CardDescription>
      </div>
      {pending.length === 0 ? (
        <p className="text-sm text-muted-foreground">No hay solicitudes pendientes.</p>
      ) : (
        <ul className="flex flex-col divide-y">
          {pending.map((applicant) => (
            <li
              key={applicant.applicationId}
              className="flex flex-wrap items-center justify-between gap-3 py-3"
            >
              <div>
                <p className="font-medium">
                  {applicant.firstName} {applicant.lastName} ·{' '}
                  {ORGANIZATION_ROLE_LABELS[applicant.desiredRole]}
                </p>
                <p className="text-sm text-muted-foreground">
                  {[applicant.city, applicant.state].filter(Boolean).join(', ')}
                  {applicant.vehicle
                    ? ` · ${applicant.vehicle.make} ${applicant.vehicle.model} ${applicant.vehicle.year} (${applicant.vehicle.plate})`
                    : ''}
                </p>
              </div>
              <ActionForm
                action={decideApplicant}
                hidden={{ organizationId, applicationId: applicant.applicationId }}
                className="flex-row"
              >
                <div className="flex gap-2">
                  <SubmitButton name="decision" value="accept" size="sm">
                    Incorporar
                  </SubmitButton>
                  <SubmitButton name="decision" value="decline" size="sm" variant="outline">
                    Rechazar
                  </SubmitButton>
                </div>
              </ActionForm>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
