import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { getCurrentUser } from '@/lib/server/session';
import { logout } from '@/app/(site)/portal/actions';

/** Reads the session: render inside <Suspense>. */
export async function UserMenu() {
  const user = await getCurrentUser();
  const name =
    [user.firstName, user.lastName].filter(Boolean).join(' ') ||
    user.email ||
    user.phone ||
    'Mi cuenta';
  return (
    <div className="flex items-center gap-3 text-sm">
      {user.platformRole ? (
        <Link href="/admin" className="opacity-80 hover:underline">
          Administración
        </Link>
      ) : null}
      <Link href="/portal/account" className="hidden hover:underline sm:inline">
        {name}
      </Link>
      {user.identityVerified ? <Badge variant="success">Verificado</Badge> : null}
      <form action={logout}>
        <Button type="submit" variant="ghost" size="sm">
          Salir
        </Button>
      </form>
    </div>
  );
}
