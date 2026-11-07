import { LegalPage, legalMetadata } from '@/components/site/legal-page';

export const metadata = legalMetadata('terminos');

export default function Page() {
  return <LegalPage slug="terminos" />;
}
