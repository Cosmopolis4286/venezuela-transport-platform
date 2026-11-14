import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
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

async function StaffShell({ children }: { children: React.ReactNode }) {
  const user = await requirePlatformStaff();
  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b bg-primary text-primary-foreground">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-4 px-6">
          <nav className="flex items-center gap-5">
            <Link href="/admin" className="font-semibold">
              VTP · Administración
            </Link>
            <Link href="/admin/stops" className="text-sm opacity-90 hover:underline">
              Terminales y paradas
            </Link>
            <Link href="/admin/bookings" className="text-sm opacity-90 hover:underline">
              Buscar reserva
            </Link>
            <Link href="/admin/taxi" className="text-sm opacity-90 hover:underline">
              Taxis por WhatsApp
            </Link>
            {user.platformRole === 'admin' ? <MoneyLinks /> : null}
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

/** Payments, settlements and refunds move money: only platform admins see them (the API agrees). */
function MoneyLinks() {
  return (
    <>
      <Link href="/admin/zones" className="text-sm opacity-90 hover:underline">
        Zonas
      </Link>
      <Link href="/admin/payments" className="text-sm opacity-90 hover:underline">
        Pagos
      </Link>
      <Link href="/admin/settlements" className="text-sm opacity-90 hover:underline">
        Liquidaciones
      </Link>
      <Link href="/admin/refunds" className="text-sm opacity-90 hover:underline">
        Reembolsos
      </Link>
      <Link href="/admin/fiscal" className="text-sm opacity-90 hover:underline">
        Facturación
      </Link>
      <Link href="/admin/trip-packs" className="text-sm opacity-90 hover:underline">
        Paquetes
      </Link>
      <Link href="/admin/metrics" className="text-sm opacity-90 hover:underline">
        Métricas
      </Link>
    </>
  );
}
