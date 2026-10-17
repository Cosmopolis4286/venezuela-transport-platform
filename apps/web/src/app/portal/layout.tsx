import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Portal de operadores',
  robots: { index: false, follow: false },
};

/**
 * Provider portal (bus companies, terminals, fleets). This route tree is the future
 * authorization boundary: an auth check belongs here once identity is implemented.
 * Authentication is NOT implemented yet — do not deploy real data behind this route.
 */
export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b bg-muted">
        <div className="mx-auto max-w-5xl px-6 py-4 font-semibold">VTP · Portal de operadores</div>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-12">{children}</main>
    </div>
  );
}
