import { LegalPage, legalMetadata } from '@/components/site/legal-page';

export const metadata = legalMetadata('condiciones-para-empresas');

export default function Page() {
  return <LegalPage slug="condiciones-para-empresas" />;
}
