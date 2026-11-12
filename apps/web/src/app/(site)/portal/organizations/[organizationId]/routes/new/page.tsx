import type { OrganizationMembershipSummary, Stop } from '@vtp/shared-types';
import Link from 'next/link';
import { Suspense } from 'react';
import { RouteEditor } from '@/components/portal/route-editor';
import { Card, CardDescription, CardTitle } from '@/components/ui/card';
import { apiFetch } from '@/lib/server/api';
import { createRoute } from '../actions';

export default function NewRoutePage({
  params,
}: PageProps<'/portal/organizations/[organizationId]/routes/new'>) {
  return (
    <Suspense fallback={<p className="text-muted-foreground">Cargando…</p>}>
      <NewRoute params={params} />
    </Suspense>
  );
}

async function NewRoute({ params }: { params: Promise<{ organizationId: string }> }) {
  const { organizationId } = await params;
  const [{ organization }, stops] = await Promise.all([
    apiFetch<OrganizationMembershipSummary>(`/organizations/${encodeURIComponent(organizationId)}`),
    apiFetch<Stop[]>('/stops'),
  ]);
  return (
    <>
      <div className="flex flex-col gap-2">
        <Link
          href={`/portal/organizations/${organization.id}`}
          className="text-sm text-muted-foreground hover:underline"
        >
          ← {organization.tradeName ?? organization.legalName}
        </Link>
        <h1 className="text-2xl font-semibold">Nueva ruta</h1>
      </div>
      <Card>
        <div className="flex flex-col gap-1">
          <CardTitle>Recorrido</CardTitle>
          <CardDescription>
            La ruta se crea como borrador. Después agregas precios y horarios y la publicas. ¿Falta
            una terminal o parada? Pídela a la administración de la plataforma.
          </CardDescription>
        </div>
        <RouteEditor
          action={createRoute}
          hidden={{ organizationId: organization.id }}
          stops={stops}
          submitLabel="Crear ruta"
        />
      </Card>
    </>
  );
}
