'use client';

import Link from 'next/link';
import { useActionState, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/label';
import { initialFormState } from '@/lib/form-state';
import { resetPassword, type ResetState } from '../../actions';

/** Forgotten password: an e-mailed code, then the new password (twice). */
export function ForgotForm() {
  const [state, action, pending] = useActionState<ResetState, FormData>(
    resetPassword,
    initialFormState,
  );
  const challenge = state.challenge;
  // Controlled, so React's reset after a failed attempt does not wipe what was typed.
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const mismatch = confirm.length > 0 && password !== confirm;
  return (
    <Card>
      <div className="flex flex-col gap-1">
        <CardTitle>Recuperar la contraseña</CardTitle>
        <CardDescription>
          Te enviamos un código al correo de tu cuenta para que elijas una contraseña nueva. Al
          cambiarla se cierran tus otras sesiones.
        </CardDescription>
      </div>
      <form action={action} className="flex flex-col gap-4">
        {challenge ? (
          <>
            <input type="hidden" name="challengeId" value={challenge.challengeId} />
            <Alert variant="success">
              Si {challenge.destinationHint} tiene una cuenta, le enviamos un código. Revisa también
              la carpeta de spam.
            </Alert>
            <Field label="Código de 6 dígitos" htmlFor="code">
              <Input
                id="code"
                name="code"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="\d{6}"
                maxLength={6}
                required
                autoFocus
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              />
            </Field>
            <Field label="Contraseña nueva" htmlFor="password" hint="Al menos 10 caracteres.">
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete="new-password"
                minLength={10}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </Field>
            <Field label="Repite la contraseña" htmlFor="confirm">
              <Input
                id="confirm"
                name="confirm"
                type="password"
                autoComplete="new-password"
                minLength={10}
                required
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
              />
            </Field>
            {mismatch ? <Alert variant="destructive">Las contraseñas no coinciden.</Alert> : null}
          </>
        ) : (
          <Field label="Correo" htmlFor="email">
            <Input id="email" name="email" type="email" autoComplete="email" required />
          </Field>
        )}
        {state.error ? <Alert variant="destructive">{state.error}</Alert> : null}
        <Button type="submit" disabled={pending || mismatch}>
          {pending ? 'Un momento…' : challenge ? 'Cambiar la contraseña y entrar' : 'Enviar código'}
        </Button>
      </form>
      <p className="text-center text-sm text-muted-foreground">
        <Link
          href="/login"
          className="font-medium text-foreground underline-offset-4 hover:underline"
        >
          Volver a iniciar sesión
        </Link>
      </p>
    </Card>
  );
}
