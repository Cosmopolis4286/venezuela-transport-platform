import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import { UserMenu } from '@/components/portal/user-menu';

export const metadata: Metadata = {
  title: 'Portal de operadores',
  robots: { index: false, follow: false },
};

/** Signed-in area. proxy.ts redirects visitors without a session; every page re-checks via the API. */
export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-1 flex-col">
      {/* Fixed-height header: the user menu streams in later and must not shift the page (misclicks). */}
      <header className="border-b bg-muted">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-4 px-6">
          <Link href="/portal" className="font-semibold">
            VTP · Portal
          </Link>
          <Suspense fallback={<span className="text-sm text-muted-foreground">…</span>}>
            <UserMenu />
          </Suspense>
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-6 py-10">
        {children}
      </main>
    </div>
  );
}
