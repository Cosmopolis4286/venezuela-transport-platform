'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';

/**
 * Fallback of the portal and admin error boundaries (Spanish areas). Server errors arrive without
 * details on purpose; the reference matches the server log.
 */
export function SectionError({
  error,
  retry,
  home,
}: {
  error: unknown;
  retry: () => void;
  home: { href: string; label: string };
}) {
  const reference = error instanceof Error && 'digest' in error ? String(error.digest) : null;
  return (
    <div role="alert" className="flex flex-col items-start gap-3 py-6">
      <h1 className="text-xl font-semibold">No pudimos mostrar esta página</h1>
      <p className="text-sm text-muted-foreground">
        Puede ser un problema momentáneo o que tu cuenta no tenga acceso a esta sección.
        {reference ? ` Referencia: ${reference}.` : ''}
      </p>
      <div className="flex gap-3">
        <Button type="button" onClick={() => retry()}>
          Intentar de nuevo
        </Button>
        <Link href={home.href} className="self-center text-sm hover:underline">
          {home.label}
        </Link>
      </div>
    </div>
  );
}
