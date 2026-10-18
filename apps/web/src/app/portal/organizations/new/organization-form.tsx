'use client';

import { ORGANIZATION_TYPES, ORGANIZATION_TYPE_LABELS } from '@vtp/shared-types';
import { useActionState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/input';
import { Field } from '@/components/ui/label';
import { initialFormState } from '@/lib/form-state';
import { createOrganization } from '../../actions';

export function OrganizationForm() {
  const [state, action, pending] = useActionState(createOrganization, initialFormState);
  return (
    <form action={action} className="grid gap-4 sm:grid-cols-2">
      <Field label="Tipo" htmlFor="type">
        <Select id="type" name="type" required defaultValue="bus_company">
          {ORGANIZATION_TYPES.map((type) => (
            <option key={type} value={type}>
              {ORGANIZATION_TYPE_LABELS[type]}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="RIF" htmlFor="rif" hint="Ejemplo: J-12345678-9">
        <Input id="rif" name="rif" required maxLength={20} />
      </Field>
      <Field label="Razón social" htmlFor="legalName">
        <Input id="legalName" name="legalName" required maxLength={160} />
      </Field>
      <Field label="Nombre comercial" htmlFor="tradeName">
        <Input id="tradeName" name="tradeName" maxLength={120} />
      </Field>
      <Field label="Teléfono" htmlFor="phone">
        <Input id="phone" name="phone" type="tel" maxLength={30} />
      </Field>
      <Field label="Correo" htmlFor="email">
        <Input id="email" name="email" type="email" maxLength={254} />
      </Field>
      <Field label="Estado" htmlFor="state">
        <Input id="state" name="state" maxLength={60} />
      </Field>
      <Field label="Ciudad" htmlFor="city">
        <Input id="city" name="city" maxLength={80} />
      </Field>
      {state.error ? (
        <Alert variant="destructive" className="sm:col-span-2">
          {state.error}
        </Alert>
      ) : null}
      <div className="sm:col-span-2">
        <Button type="submit" disabled={pending}>
          {pending ? 'Registrando…' : 'Registrar'}
        </Button>
      </div>
    </form>
  );
}
