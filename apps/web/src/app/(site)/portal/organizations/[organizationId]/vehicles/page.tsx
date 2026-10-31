import type { FleetVehicle, OrganizationMembershipSummary, SeatLayout } from '@vtp/shared-types';
import Link from 'next/link';
import { Suspense } from 'react';
import { ActionForm, SubmitButton } from '@/components/portal/action-form';
import { Badge } from '@/components/ui/badge';
import { Card, CardTitle } from '@/components/ui/card';
import { Input, Select } from '@/components/ui/input';
import { Field } from '@/components/ui/label';
import { apiFetch } from '@/lib/server/api';
import { createVehicle, updateVehicle } from './actions';

export default function VehiclesPage({
  params,
}: PageProps<'/portal/organizations/[organizationId]/vehicles'>) {
  return (
    <Suspense fallback={<p className="text-muted-foreground">Cargando…</p>}>
      <Vehicles params={params} />
    </Suspense>
  );
}

async function Vehicles({ params }: { params: Promise<{ organizationId: string }> }) {
  const { organizationId } = await params;
  const base = `/organizations/${encodeURIComponent(organizationId)}`;
  const [{ organization, permissions }, vehicles, layouts] = await Promise.all([
    apiFetch<OrganizationMembershipSummary>(base),
    apiFetch<FleetVehicle[]>(`${base}/vehicles`),
    apiFetch<SeatLayout[]>(`${base}/seat-layouts`),
  ]);
  const canManage = permissions.includes('fleet.manage');
  const hidden = { organizationId: organization.id };

  const layoutSelect = (id: string, value: string | null) => (
    <Select id={id} name="seatLayoutId" defaultValue={value ?? ''}>
      <option value="">Sin mapa (cualquier salida)</option>
      {layouts.map((layout) => (
        <option key={layout.id} value={layout.id}>
          {layout.name} ({layout.capacity} puestos)
        </option>
      ))}
    </Select>
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
        <h1 className="text-2xl font-semibold">Vehículos</h1>
        <p className="text-sm text-muted-foreground">
          Las unidades que se asignan a cada salida. Un vehículo con mapa de puestos solo se asigna
          a salidas vendidas con ese mapa.
        </p>
      </div>

      {canManage ? (
        <Card>
          <CardTitle>Agregar vehículo</CardTitle>
          <ActionForm action={createVehicle} hidden={hidden} resetOnSuccess>
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Placa" htmlFor="plate">
                <Input id="plate" name="plate" required maxLength={20} placeholder="AB123CD" />
              </Field>
              <Field label="Nombre interno (opcional)" htmlFor="label">
                <Input id="label" name="label" maxLength={80} placeholder="Unidad 12" />
              </Field>
              <Field label="Mapa de puestos" htmlFor="seatLayoutId">
                {layoutSelect('seatLayoutId', null)}
              </Field>
            </div>
            <div>
              <SubmitButton>Agregar</SubmitButton>
            </div>
          </ActionForm>
        </Card>
      ) : null}

      <Card>
        <CardTitle>Flota ({vehicles.length})</CardTitle>
        {vehicles.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aún no hay vehículos.</p>
        ) : (
          <ul className="flex flex-col divide-y">
            {vehicles.map((vehicle) => (
              <li key={vehicle.id} className="flex flex-col gap-3 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium tabular-nums">{vehicle.plate}</span>
                  {vehicle.label ? (
                    <span className="text-sm text-muted-foreground">{vehicle.label}</span>
                  ) : null}
                  {vehicle.active ? null : <Badge variant="secondary">Inactivo</Badge>}
                  {canManage ? null : (
                    <span className="text-sm text-muted-foreground">
                      · {vehicle.seatLayout?.name ?? 'Sin mapa de puestos'}
                    </span>
                  )}
                </div>
                {canManage ? (
                  <ActionForm action={updateVehicle} hidden={{ ...hidden, vehicleId: vehicle.id }}>
                    <div className="grid items-end gap-3 sm:grid-cols-[1fr_1fr_auto_auto]">
                      <Field label="Nombre interno" htmlFor={`label-${vehicle.id}`}>
                        <Input
                          id={`label-${vehicle.id}`}
                          name="label"
                          maxLength={80}
                          defaultValue={vehicle.label ?? ''}
                        />
                      </Field>
                      <Field label="Mapa de puestos" htmlFor={`layout-${vehicle.id}`}>
                        {layoutSelect(`layout-${vehicle.id}`, vehicle.seatLayout?.id ?? null)}
                      </Field>
                      <label className="flex h-9 items-center gap-2 text-sm">
                        <input type="checkbox" name="active" defaultChecked={vehicle.active} />
                        Activo
                      </label>
                      <SubmitButton size="sm" variant="outline">
                        Guardar
                      </SubmitButton>
                    </div>
                  </ActionForm>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
