import { LegalPage, legalMetadata } from '@/components/site/legal-page';

export const metadata = legalMetadata('conductores-independientes');

export default function Page() {
  return <LegalPage slug="conductores-independientes" />;
}
