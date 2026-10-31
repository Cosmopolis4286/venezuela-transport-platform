import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import { UserMenu } from '@/components/portal/user-menu';
import { getCurrentUser, requirePlatformStaff } from '@/lib/server/session';

export const metadata: Metadata = {
  title: 'Administración',
  robots: { index: false, follow: false },
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
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
            <Suspense>
              <MoneyLinks />
            </Suspense>
          </nav>
          <Suspense>
            <UserMenu />
          </Suspense>
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-6 py-10">
        <Suspense fallback={<p className="text-muted-foreground">Cargando…</p>}>
          <StaffOnly>{children}</StaffOnly>
        </Suspense>
      </main>
    </div>
  );
}

/** Non-staff are redirected to /portal; the API enforces the same rule on every call. */
async function StaffOnly({ children }: { children: React.ReactNode }) {
  await requirePlatformStaff();
  return children;
}

/** Settlements and refunds move money: only platform admins see them (the API agrees). */
async function MoneyLinks() {
  const user = await getCurrentUser();
  if (user.platformRole !== 'admin') return null;
  return (
    <>
      <Link href="/admin/settlements" className="text-sm opacity-90 hover:underline">
        Liquidaciones
      </Link>
      <Link href="/admin/refunds" className="text-sm opacity-90 hover:underline">
        Reembolsos
      </Link>
    </>
  );
}
