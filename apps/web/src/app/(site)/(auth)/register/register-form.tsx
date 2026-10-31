'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/label';
import { initialFormState } from '@/lib/form-state';
import { register } from '../actions';

export function RegisterForm() {
  const [state, action, pending] = useActionState(register, initialFormState);
  return (
    <Card>
      <div className="flex flex-col gap-1">
        <CardTitle>Crear cuenta</CardTitle>
        <CardDescription>Para pasajeros, empresas y operadores.</CardDescription>
      </div>
      <form action={action} className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Nombre" htmlFor="firstName">
            <Input id="firstName" name="firstName" autoComplete="given-name" required />
          </Field>
          <Field label="Apellido" htmlFor="lastName">
            <Input id="lastName" name="lastName" autoComplete="family-name" required />
          </Field>
        </div>
        <Field label="Correo" htmlFor="email">
          <Input id="email" name="email" type="email" autoComplete="email" required />
        </Field>
        <Field
          label="Contraseña"
          htmlFor="password"
          hint="Mínimo 10 caracteres. Una frase es más segura que símbolos raros."
        >
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            minLength={10}
            maxLength={128}
            required
          />
        </Field>
        {state.error ? (
          <Alert variant="destructive">{state.fieldErrors?.password ?? state.error}</Alert>
        ) : null}
        <Button type="submit" disabled={pending}>
          {pending ? 'Creando…' : 'Crear cuenta'}
        </Button>
      </form>
      <p className="text-center text-sm text-muted-foreground">
        ¿Ya tienes cuenta?{' '}
        <Link
          href="/login"
          className="font-medium text-foreground underline-offset-4 hover:underline"
        >
          Inicia sesión
        </Link>
      </p>
    </Card>
  );
}
