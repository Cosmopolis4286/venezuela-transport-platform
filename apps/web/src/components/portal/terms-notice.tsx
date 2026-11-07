import { LEGAL_PAGES, LEGAL_VERSION } from '@vtp/shared-types';
import Link from 'next/link';
import { acceptTerms } from '@/app/(site)/portal/actions';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { getCurrentUser } from '@/lib/server/session';

/** Asks to accept the current Terms and Privacy Policy. Reads the session: render in <Suspense>. */
export async function TermsNotice() {
  const user = await getCurrentUser();
  if (user.termsVersion === LEGAL_VERSION) return null;
  return (
    <Alert>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span>
          Para seguir usando VTP, revisa y acepta los{' '}
          <Link href={`/es/legal/${LEGAL_PAGES.terms}`} className="underline underline-offset-4">
            Términos y Condiciones
          </Link>{' '}
          y la{' '}
          <Link href={`/es/legal/${LEGAL_PAGES.privacy}`} className="underline underline-offset-4">
            Política de Privacidad
          </Link>{' '}
          vigentes.
        </span>
        <form action={acceptTerms}>
          <Button type="submit" size="sm">
            Acepto
          </Button>
        </form>
      </div>
    </Alert>
  );
}
