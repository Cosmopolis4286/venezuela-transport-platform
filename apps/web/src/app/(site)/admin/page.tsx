import {
  ORGANIZATION_ROLE_LABELS,
  ORGANIZATION_TYPE_LABELS,
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
import { reviewOrganization } from './actions';

export default async function AdminPage() {
  const [organizations, applications] = await Promise.all([
    apiFetch<Organization[]>('/admin/organizations?status=pending_review'),
    apiFetch<ProviderApplication[]>('/admin/applications?status=submitted'),
  ]);
  return (
    <>
      <h1 className="text-2xl font-semibold">Revisiones pendientes</h1>

      <Card>
        <div className="flex flex-col gap-1">
          <CardTitle>Solicitudes de conductores y personal (KYC) · {applications.length}</CardTitle>
          <CardDescription>Revisa los documentos de cada persona antes de aprobar.</CardDescription>
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
                <Button asChild size="sm">
                  <Link href={`/admin/applications/${application.id}`} prefetch>
                    Revisar
                  </Link>
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Card>

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
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
