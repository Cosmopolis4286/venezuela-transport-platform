import {
  DOCUMENT_KIND_LABELS,
  ORGANIZATION_ROLE_LABELS,
  ORGANIZATION_TYPE_LABELS,
  PLATFORM_ROLE_LABELS,
  platformRoleHasPermission,
  type PlatformPermission,
  type DocumentRenewalForReview,
  type Organization,
  type ProviderApplication,
} from '@vtp/shared-types';
import Link from 'next/link';
import { ActionForm, SubmitButton } from '@/components/portal/action-form';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { formatDate } from '@/lib/labels';
import { apiFetch } from '@/lib/server/api';
import { requirePlatformStaff } from '@/lib/server/session';
import { reviewOrganization, reviewRenewal } from './actions';

export default async function AdminPage({ searchParams }: PageProps<'/admin'>) {
  const user = await requirePlatformStaff();
  const can = (permission: PlatformPermission) =>
    platformRoleHasPermission(user.platformRole, permission);
  const denied = (await searchParams).denied === '1';
  const [organizations, applications, renewals] = await Promise.all([
    can('organizations.view')
      ? apiFetch<Organization[]>('/admin/organizations?status=pending_review')
      : null,
    can('applications.view')
      ? apiFetch<ProviderApplication[]>('/admin/applications?status=submitted')
      : null,
    can('applications.review')
      ? apiFetch<DocumentRenewalForReview[]>('/admin/document-renewals')
      : null,
  ]);
  return (
    <>
      <h1 className="text-2xl font-semibold">Revisiones pendientes</h1>
      {denied ? (
        <p role="alert" className="rounded-md border border-destructive/40 px-3 py-2 text-sm">
          Tu rol ({PLATFORM_ROLE_LABELS[user.platformRole!]}) no permite abrir esa sección.
        </p>
      ) : null}
      {!can('organizations.review') && !can('applications.review') ? (
        <p className="text-sm text-muted-foreground">
          Puedes ver las colas, pero las aprobaciones las hace el equipo de revisión.
        </p>
      ) : null}

      {applications ? (
        <Card>
          <div className="flex flex-col gap-1">
            <CardTitle>
              Solicitudes de conductores y personal (KYC) · {applications.length}
            </CardTitle>
            <CardDescription>
              Revisa los documentos de cada persona antes de aprobar.
            </CardDescription>
          </div>
          {applications.length === 0 ? (
            <p className="text-sm text-muted-foreground">No hay solicitudes por revisar.</p>
          ) : (
            <ul className="flex flex-col divide-y">
              {applications.map((application) => (
                <li
                  key={application.id}
                  className="flex flex-wrap items-center justify-between gap-3 py-3"
                >
                  <div>
                    <p className="font-medium">
                      {application.firstName} {application.lastName} ·{' '}
                      {ORGANIZATION_ROLE_LABELS[application.desiredRole]}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {application.organization
                        ? `${application.organization.legalName} · `
                        : 'Sin organización · '}
                      enviada {application.submittedAt ? formatDate(application.submittedAt) : ''} ·{' '}
                      {application.documents.length} documentos
                    </p>
                  </div>
                  {can('applications.review') ? (
                    <Button asChild size="sm">
                      <Link href={`/admin/applications/${application.id}`} prefetch>
                        Revisar
                      </Link>
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </Card>
      ) : null}

      {renewals ? (
        <Card>
          <div className="flex flex-col gap-1">
            <CardTitle>Documentos renovados · {renewals.length}</CardTitle>
            <CardDescription>
              Conductores aprobados que subieron una copia nueva de su licencia, certificado médico
              o póliza RCV. Al aprobarla reemplaza la anterior; con la licencia o el certificado
              vencidos no pueden conectarse.
            </CardDescription>
          </div>
          {renewals.length === 0 ? (
            <p className="text-sm text-muted-foreground">No hay documentos por revisar.</p>
          ) : (
            <ul className="flex flex-col divide-y">
              {renewals.map((renewal) => (
                <li key={renewal.id} className="flex flex-col gap-3 py-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium">
                      {renewal.firstName} {renewal.lastName}
                    </p>
                    <Badge variant="outline">{DOCUMENT_KIND_LABELS[renewal.kind]}</Badge>
                    <span className="text-sm text-muted-foreground">
                      vence el {formatDate(`${renewal.expiresOn}T12:00:00Z`)}
                      {renewal.currentExpiresOn
                        ? ` (la actual: ${formatDate(`${renewal.currentExpiresOn}T12:00:00Z`)})`
                        : ''}{' '}
                      · subida {formatDate(renewal.uploadedAt)}
                    </span>
                    <a
                      href={`/admin/renewals/${renewal.id}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-sm underline"
                    >
                      Ver archivo
                    </a>
                  </div>
                  <ActionForm action={reviewRenewal} hidden={{ renewalId: renewal.id }}>
                    <div className="flex flex-wrap gap-2">
                      <Input
                        name="reason"
                        placeholder="Motivo (obligatorio para rechazar)"
                        className="max-w-sm"
                      />
                      <SubmitButton name="decision" value="accept" size="sm">
                        Aprobar
                      </SubmitButton>
                      <SubmitButton name="decision" value="reject" size="sm" variant="outline">
                        Rechazar
                      </SubmitButton>
                    </div>
                  </ActionForm>
                </li>
              ))}
            </ul>
          )}
        </Card>
      ) : null}

      {organizations ? (
        <Card>
          <div className="flex flex-col gap-1">
            <CardTitle>Organizaciones en revisión · {organizations.length}</CardTitle>
            <CardDescription>
              Verifica el RIF y los datos de contacto. Para rechazar indica el motivo.
            </CardDescription>
          </div>
          {organizations.length === 0 ? (
            <p className="text-sm text-muted-foreground">No hay organizaciones por revisar.</p>
          ) : (
            <ul className="flex flex-col divide-y">
              {organizations.map((organization) => (
                <li key={organization.id} className="flex flex-col gap-3 py-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium">{organization.legalName}</p>
                    <Badge variant="outline">{ORGANIZATION_TYPE_LABELS[organization.type]}</Badge>
                    <span className="text-sm text-muted-foreground">
                      RIF {organization.rif} ·{' '}
                      {[organization.city, organization.state].filter(Boolean).join(', ')} ·
                      registrada {formatDate(organization.createdAt)}
                    </span>
                  </div>
                  {can('organizations.review') ? (
                    <ActionForm
                      action={reviewOrganization}
                      hidden={{ organizationId: organization.id }}
                    >
                      <div className="flex flex-wrap gap-2">
                        <Input
                          name="notes"
                          placeholder="Motivo (obligatorio para rechazar)"
                          className="max-w-sm"
                        />
                        <SubmitButton name="decision" value="approve" size="sm">
                          Aprobar
                        </SubmitButton>
                        <SubmitButton name="decision" value="reject" size="sm" variant="outline">
                          Rechazar
                        </SubmitButton>
                      </div>
                    </ActionForm>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </Card>
      ) : null}
    </>
  );
}
