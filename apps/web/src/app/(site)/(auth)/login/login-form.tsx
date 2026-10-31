'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useActionState, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardTitle } from '@/components/ui/card';
import { Input, Select } from '@/components/ui/input';
import { Field } from '@/components/ui/label';
import { initialFormState } from '@/lib/form-state';
import { cn } from '@/lib/utils';
import { loginWithPassword, signInWithCode, type CodeState } from '../actions';

export function LoginForm() {
  const params = useSearchParams();
  const next = params.get('next') ?? '/portal';
  const [mode, setMode] = useState<'code' | 'password'>('code');

  return (
    <Card>
      <div className="flex flex-col gap-1">
        <CardTitle>Iniciar sesión</CardTitle>
        <CardDescription>Usa un código por teléfono o correo, o tu contraseña.</CardDescription>
      </div>
      {params.get('expired') ? <Alert>Tu sesión expiró. Inicia sesión de nuevo.</Alert> : null}
      <div role="tablist" className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1 text-sm">
        {(['code', 'password'] as const).map((value) => (
          <button
            key={value}
            role="tab"
            type="button"
            aria-selected={mode === value}
            onClick={() => setMode(value)}
            className={cn(
              'rounded-md px-3 py-1.5',
              mode === value ? 'bg-background font-medium shadow-sm' : 'text-muted-foreground',
            )}
          >
            {value === 'code' ? 'Con código' : 'Con contraseña'}
          </button>
        ))}
      </div>
      {mode === 'code' ? <CodeForm next={next} /> : <PasswordForm next={next} />}
      <p className="text-center text-sm text-muted-foreground">
        ¿No tienes cuenta?{' '}
        <Link
          href="/register"
          className="font-medium text-foreground underline-offset-4 hover:underline"
        >
          Regístrate
        </Link>
      </p>
    </Card>
  );
}

function PasswordForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState(loginWithPassword, initialFormState);
  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="next" value={next} />
      <Field label="Correo" htmlFor="email">
        <Input id="email" name="email" type="email" autoComplete="email" required />
      </Field>
      <Field label="Contraseña" htmlFor="password">
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
        />
      </Field>
      {state.error ? <Alert variant="destructive">{state.error}</Alert> : null}
      <Button type="submit" disabled={pending}>
        {pending ? 'Entrando…' : 'Entrar'}
      </Button>
    </form>
  );
}

function CodeForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState<CodeState, FormData>(
    signInWithCode,
    initialFormState,
  );
  const challenge = state.challenge;
  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="next" value={next} />
      {challenge ? (
        <>
          <input type="hidden" name="challengeId" value={challenge.challengeId} />
          <Alert variant="success">Enviamos un código a {challenge.destinationHint}.</Alert>
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
            />
          </Field>
        </>
      ) : (
        <>
          <Field label="Recibir el código por" htmlFor="channel">
            <Select id="channel" name="channel" defaultValue="sms">
              <option value="sms">SMS</option>
              <option value="whatsapp">WhatsApp</option>
              <option value="email">Correo</option>
            </Select>
          </Field>
          <Field label="Teléfono o correo" htmlFor="destination" hint="Ejemplo: 0412-1234567">
            <Input id="destination" name="destination" autoComplete="tel" required />
          </Field>
        </>
      )}
      {state.error ? <Alert variant="destructive">{state.error}</Alert> : null}
      <Button type="submit" disabled={pending}>
        {pending ? 'Un momento…' : challenge ? 'Verificar y entrar' : 'Enviar código'}
      </Button>
    </form>
  );
}
