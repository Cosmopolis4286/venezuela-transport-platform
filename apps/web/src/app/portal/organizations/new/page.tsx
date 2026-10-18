import type { Metadata } from 'next';
import { Card, CardDescription, CardTitle } from '@/components/ui/card';
import { OrganizationForm } from './organization-form';

export const metadata: Metadata = { title: 'Registrar organización' };

export default function NewOrganizationPage() {
  return (
    <Card>
      <div className="flex flex-col gap-1">
        <CardTitle>Registrar organización</CardTitle>
        <CardDescription>
          Serás su dueño. Podrás invitar a tu equipo mientras la administración la revisa.
        </CardDescription>
      </div>
      <OrganizationForm />
    </Card>
  );
}
