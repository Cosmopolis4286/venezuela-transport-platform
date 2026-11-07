import { LegalPage, legalMetadata } from '@/components/site/legal-page';

export const metadata = legalMetadata('privacidad');

export default function Page() {
  return <LegalPage slug="privacidad" />;
}
