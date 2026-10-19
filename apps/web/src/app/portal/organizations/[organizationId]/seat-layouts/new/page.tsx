import type { OrganizationMembershipSummary } from '@vtp/shared-types';
import Link from 'next/link';
import { Suspense } from 'react';
import { SeatLayoutEditor } from '@/components/portal/seat-layout-editor';
import { Card, CardDescription, CardTitle } from '@/components/ui/card';
import { apiFetch } from '@/lib/server/api';
import { createSeatLayout } from '../actions';

export default function NewSeatLayoutPage({
  params,
}: PageProps<'/portal/organizations/[organizationId]/seat-layouts/new'>) {
  return (
    <Suspense fallback={<p className="text-muted-foreground">Cargando…</p>}>
      <NewSeatLayout params={params} />
    </Suspense>
  );
}

async function NewSeatLayout({ params }: { params: Promise<{ organizationId: string }> }) {
  const { organizationId } = await params;
  const { organization } = await apiFetch<OrganizationMembershipSummary>(
    `/organizations/${encodeURIComponent(organizationId)}`,
  );
  return (
    <>
      <div className="flex flex-col gap-2">
        <Link
          href={`/portal/organizations/${organization.id}`}
          className="text-sm text-muted-foreground hover:underline"
        >
          ← {organization.tradeName ?? organization.legalName}
        </Link>
        <h1 className="text-2xl font-semibold">Nuevo mapa de puestos</h1>
      </div>
      <Card>
        <div className="flex flex-col gap-1">
          <CardTitle>Distribución</CardTitle>
          <CardDescription>
            Crea un plano por cada tipo de unidad que usas. Luego asígnalo a los horarios para que
            los pasajeros elijan su puesto.
          </CardDescription>
        </div>
        <SeatLayoutEditor
          action={createSeatLayout}
          hidden={{ organizationId: organization.id }}
          submitLabel="Crear mapa"
        />
      </Card>
    </>
  );
}
