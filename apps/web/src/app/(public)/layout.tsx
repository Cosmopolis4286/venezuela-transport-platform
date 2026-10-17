import Link from 'next/link';

/** Layout for the public website (search, information pages). No authentication. */
export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <header className="border-b">
        <nav className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <Link href="/" className="font-semibold">
            VTP
          </Link>
          <Link href="/portal" className="text-sm text-muted-foreground hover:underline">
            Portal de operadores
          </Link>
        </nav>
      </header>
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-6 py-16">{children}</main>
    </>
  );
}
