import type { OrganizationMembershipSummary, SeatLayout } from '@vtp/shared-types';
import Link from 'next/link';
import { Suspense } from 'react';
import { ActionForm, SubmitButton } from '@/components/portal/action-form';
import { SeatLayoutEditor, SeatLayoutView } from '@/components/portal/seat-layout-editor';
import { Card, CardDescription, CardTitle } from '@/components/ui/card';
import { apiFetch } from '@/lib/server/api';
import { deleteSeatLayout, updateSeatLayout } from '../actions';

export default function SeatLayoutPage({
  params,
}: PageProps<'/portal/organizations/[organizationId]/seat-layouts/[layoutId]'>) {
  return (
    <Suspense fallback={<p className="text-muted-foreground">Cargando…</p>}>
      <SeatLayoutDetail params={params} />
    </Suspense>
  );
}

async function SeatLayoutDetail({
  params,
}: {
  params: Promise<{ organizationId: string; layoutId: string }>;
}) {
  const { organizationId, layoutId } = await params;
  const base = `/organizations/${encodeURIComponent(organizationId)}`;
  const [{ organization, permissions }, layout] = await Promise.all([
    apiFetch<OrganizationMembershipSummary>(base),
    apiFetch<SeatLayout>(`${base}/seat-layouts/${encodeURIComponent(layoutId)}`),
  ]);
  const canManage = permissions.includes('fleet.manage');
  const hidden = { organizationId: organization.id, layoutId: layout.id };

  return (
    <>
      <div className="flex flex-col gap-2">
        <Link
          href={`/portal/organizations/${organization.id}`}
          className="text-sm text-muted-foreground hover:underline"
        >
          ← {organization.tradeName ?? organization.legalName}
        </Link>
        <h1 className="text-2xl font-semibold">{layout.name}</h1>
        <p className="text-sm text-muted-foreground">
          {layout.capacity} puestos · {layout.decks === 2 ? 'dos pisos · ' : ''}
          {layout.scheduleCount === 1
            ? 'usado en 1 horario'
            : `usado en ${layout.scheduleCount} horarios`}
        </p>
      </div>
      <Card>
        <CardTitle>Distribución</CardTitle>
        {canManage ? (
          <>
            {layout.scheduleCount ? (
              <CardDescription>
                Si cambias la cantidad de puestos, los horarios que usan este plano se actualizan.
              </CardDescription>
            ) : null}
            <SeatLayoutEditor
              action={updateSeatLayout}
              hidden={hidden}
              initial={layout}
              submitLabel="Guardar mapa"
            />
          </>
        ) : (
          <SeatLayoutView layout={layout} />
        )}
      </Card>
      {canManage ? (
        <ActionForm action={deleteSeatLayout} hidden={hidden}>
          <div>
            <SubmitButton variant="outline">Eliminar mapa</SubmitButton>
          </div>
        </ActionForm>
      ) : null}
    </>
  );
}
