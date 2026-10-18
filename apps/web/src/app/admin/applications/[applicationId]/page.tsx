import { ORGANIZATION_ROLE_LABELS, type ProviderApplication } from '@vtp/shared-types';
import Link from 'next/link';
import { Suspense } from 'react';
import { Badge } from '@/components/ui/badge';
import { Card, CardTitle } from '@/components/ui/card';
import { APPLICATION_STATUS_LABELS, statusVariant } from '@/lib/labels';
import { apiFetch } from '@/lib/server/api';
import { ReviewForm } from './review-form';

export default function ApplicationReviewPage({
  params,
}: PageProps<'/admin/applications/[applicationId]'>) {
  return (
    <Suspense fallback={<p className="text-muted-foreground">Cargando…</p>}>
      <Application params={params} />
    </Suspense>
  );
}

async function Application({ params }: { params: Promise<{ applicationId: string }> }) {
  const { applicationId } = await params;
  const application = await apiFetch<ProviderApplication>(
    `/admin/applications/${encodeURIComponent(applicationId)}`,
  );
  const rows: [string, string][] = [
    ['Rol solicitado', ORGANIZATION_ROLE_LABELS[application.desiredRole]],
    ['Documento', `${application.documentType}-${application.documentNumber}`],
    ['Fecha de nacimiento', application.birthDate],
    ['Ubicación', [application.city, application.state].filter(Boolean).join(', ') || '—'],
    ['Organización', application.organization?.legalName ?? 'Ninguna'],
    [
      'Vehículo',
      application.vehicle
        ? `${application.vehicle.make} ${application.vehicle.model} ${application.vehicle.year} · ${application.vehicle.color} · ${application.vehicle.plate}`
        : 'No aporta vehículo',
    ],
  ];
  return (
    <>
      <div className="flex flex-col gap-2">
        <Link href="/admin" className="text-sm text-muted-foreground hover:underline">
          ← Revisiones pendientes
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold">
            {application.firstName} {application.lastName}
          </h1>
          <Badge variant={statusVariant(application.status)}>
            {APPLICATION_STATUS_LABELS[application.status]}
          </Badge>
        </div>
      </div>
      <Card>
        <CardTitle>Datos</CardTitle>
        <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[12rem_1fr]">
          {rows.map(([label, value]) => (
            <div key={label} className="contents">
              <dt className="text-muted-foreground">{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      </Card>
      <Card>
        <CardTitle>Documentos y decisión</CardTitle>
        {application.status === 'submitted' ? (
          <ReviewForm applicationId={application.id} documents={application.documents} />
        ) : (
          <p className="text-sm text-muted-foreground">
            Esta solicitud ya no está pendiente de revisión.
          </p>
        )}
      </Card>
    </>
  );
}
