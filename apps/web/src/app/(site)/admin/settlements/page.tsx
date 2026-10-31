import {
  formatPaymentAmount,
  ORGANIZATION_TYPE_LABELS,
  type AdminSettlementSummary,
} from '@vtp/shared-types';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardTitle } from '@/components/ui/card';
import { apiFetch } from '@/lib/server/api';
import { requirePlatformAdmin } from '@/lib/server/session';

export default async function AdminSettlementsPage() {
  await requirePlatformAdmin();
  const summaries = await apiFetch<AdminSettlementSummary[]>('/admin/settlements');
  return (
    <>
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold">Liquidaciones</h1>
        <p className="text-sm text-muted-foreground">
          Lo que la plataforma le debe a cada empresa por los boletos pagados (tarifa menos
          comisión). Abre una empresa para fijar su comisión o registrar un pago.
        </p>
      </div>
      <Card>
        <CardTitle>Empresas · {summaries.length}</CardTitle>
        <CardDescription>
          Las empresas de autobuses activas, y cualquier otra con ventas o pagos registrados.
        </CardDescription>
        {summaries.length === 0 ? (
          <p className="text-sm text-muted-foreground">Todavía no hay empresas activas.</p>
        ) : (
          <ul className="flex flex-col divide-y">
            {summaries.map((s) => {
              const owed = s.balances.filter((b) => b.balance !== '0.00');
              return (
                <li
                  key={s.organization.id}
                  className="flex flex-wrap items-center justify-between gap-3 py-3"
                >
                  <div className="flex flex-col gap-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{s.organization.name}</span>
                      <Badge variant="secondary">
                        {ORGANIZATION_TYPE_LABELS[s.organization.type]}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Comisión {s.commissionRate.replace('.', ',')} %
                      {s.commissionOverride ? ' (acordada)' : ' (por defecto)'} · Por pagar:{' '}
                      {owed.length
                        ? owed.map((b) => formatPaymentAmount(b.balance, b.currency)).join(' + ')
                        : 'nada'}
                    </p>
                  </div>
                  <Button asChild size="sm" variant={owed.length ? 'default' : 'outline'}>
                    <Link href={`/admin/settlements/${s.organization.id}`}>Abrir</Link>
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </>
  );
}
