import { LegalPage, legalMetadata } from '@/components/site/legal-page';

export const metadata = legalMetadata('cancelacion-y-reembolsos');

export default function Page() {
  return <LegalPage slug="cancelacion-y-reembolsos" />;
}
