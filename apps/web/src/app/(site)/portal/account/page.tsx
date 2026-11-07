import { LEGAL_PAGES, LEGAL_VERSION } from '@vtp/shared-types';
import Link from 'next/link';
import { Suspense } from 'react';
import { ActionForm, SubmitButton } from '@/components/portal/action-form';
import { Card, CardDescription, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { getCurrentUser } from '@/lib/server/session';
import { deleteAccount } from '../actions';

export default function AccountPage() {
  return (
    <Suspense fallback={<p className="text-muted-foreground">Cargando…</p>}>
      <Account />
    </Suspense>
  );
}

async function Account() {
  const user = await getCurrentUser();
  const name = [user.firstName, user.lastName].filter(Boolean).join(' ') || 'Sin nombre';
  return (
    <>
      <h1 className="text-2xl font-semibold">Mi cuenta</h1>
      <Card>
        <CardTitle>{name}</CardTitle>
        <p className="text-sm text-muted-foreground">
          {[user.email, user.phone].filter(Boolean).join(' · ')}
        </p>
        <p className="text-sm text-muted-foreground">
          {user.termsVersion === LEGAL_VERSION
            ? `Aceptaste los Términos y la Política de Privacidad (versión ${LEGAL_VERSION}).`
            : 'Todavía no aceptaste la versión vigente de los Términos y la Política de Privacidad.'}{' '}
          <Link href={`/es/legal/${LEGAL_PAGES.terms}`} className="underline underline-offset-4">
            Términos
          </Link>{' '}
          ·{' '}
          <Link href={`/es/legal/${LEGAL_PAGES.privacy}`} className="underline underline-offset-4">
            Privacidad
          </Link>
        </p>
      </Card>
      <Card className="border-destructive/40">
        <div className="flex flex-col gap-1">
          <CardTitle>Borrar mi cuenta</CardTitle>
          <CardDescription>
            Se borran tu correo, teléfono, nombre y contraseña, se cierran todas tus sesiones y
            sales de tus organizaciones. Lo que la ley obliga a conservar (reservas, pagos, listas
            de pasajeros) queda guardado sin vínculo con tu cuenta. No se puede deshacer. Antes no
            debes tener viajes pagados pendientes, pagos en verificación ni reembolsos por recibir,
            ni ser el único dueño de una organización.
          </CardDescription>
        </div>
        <ActionForm action={deleteAccount}>
          <div className="flex flex-wrap items-end gap-2">
            <Input
              name="confirm"
              required
              autoComplete="off"
              className="w-48"
              placeholder="Escribe BORRAR"
              aria-label="Escribe BORRAR para confirmar"
            />
            <SubmitButton variant="destructive">Borrar mi cuenta</SubmitButton>
          </div>
        </ActionForm>
      </Card>
    </>
  );
}
