import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import {
  PLATFORM_ROLE_LABELS,
  platformRoleHasPermission,
  type PlatformPermission,
} from '@vtp/shared-types';
import { UserMenu } from '@/components/portal/user-menu';
import { requirePlatformStaff } from '@/lib/server/session';

export const metadata: Metadata = {
  title: 'Administración',
  robots: { index: false, follow: false },
};

/**
 * Nothing of the admin area is sent, not even its header, until the user is known to be platform
 * staff: others are redirected to /portal before any byte of it streams. The API enforces the
 * same rule on every call.
 */
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<p className="p-6 text-muted-foreground">Cargando…</p>}>
      <StaffShell>{children}</StaffShell>
    </Suspense>
  );
}

/** Each section and the platform permission that opens it (the API checks the same). */
const SECTIONS: [href: string, label: string, permission: PlatformPermission][] = [
  ['/admin/stops', 'Terminales y paradas', 'network.manage'],
  ['/admin/bookings', 'Buscar reserva', 'bookings.search'],
  ['/admin/taxi', 'Taxis por WhatsApp', 'taxi.assist'],
  ['/admin/zones', 'Zonas', 'zones.manage'],
  ['/admin/payments', 'Pagos', 'finance.manage'],
  ['/admin/settlements', 'Liquidaciones', 'finance.manage'],
  ['/admin/refunds', 'Reembolsos', 'finance.manage'],
  ['/admin/fiscal', 'Facturación', 'finance.manage'],
  ['/admin/trip-packs', 'Paquetes', 'products.manage'],
  ['/admin/metrics', 'Métricas', 'metrics.view'],
];

async function StaffShell({ children }: { children: React.ReactNode }) {
  const user = await requirePlatformStaff();
  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b bg-primary text-primary-foreground">
        <div className="mx-auto flex min-h-14 max-w-5xl flex-wrap items-center justify-between gap-4 px-6 py-2">
          <nav className="flex flex-wrap items-center gap-x-5 gap-y-1">
            <Link href="/admin" className="font-semibold">
              VTP · {PLATFORM_ROLE_LABELS[user.platformRole!]}
            </Link>
            {SECTIONS.filter(([, , permission]) =>
              platformRoleHasPermission(user.platformRole, permission),
            ).map(([href, label]) => (
              <Link key={href} href={href} className="text-sm opacity-90 hover:underline">
                {label}
              </Link>
            ))}
          </nav>
          <Suspense>
            <UserMenu />
          </Suspense>
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-6 py-10">
        <Suspense fallback={<p className="text-muted-foreground">Cargando…</p>}>
          {children}
        </Suspense>
      </main>
    </div>
  );
}
