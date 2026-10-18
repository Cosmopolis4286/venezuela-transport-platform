'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { initialFormState, type FormState } from '@/lib/form-state';
import { cn } from '@/lib/utils';

/**
 * A form bound to a Server Action that shows its success or error message. Hidden inputs carry
 * ids; the action re-authorizes with the API, so tampering with them only produces an API error.
 * Children must be serializable (Server Components can't pass functions): use SubmitButton for
 * pending state.
 */
export function ActionForm({
  action,
  hidden,
  children,
  className,
}: {
  action: (state: FormState, form: FormData) => Promise<FormState>;
  hidden?: Record<string, string>;
  children: React.ReactNode;
  className?: string;
}) {
  const [state, formAction] = useActionState(action, initialFormState);
  return (
    <form action={formAction} className={cn('flex flex-col gap-3', className)}>
      {Object.entries(hidden ?? {}).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      {children}
      {state.error ? <Alert variant="destructive">{state.error}</Alert> : null}
      {state.success ? <Alert variant="success">{state.success}</Alert> : null}
    </form>
  );
}

/** Submit button disabled while its form's action is running. */
export function SubmitButton(props: React.ComponentProps<typeof Button>) {
  const { pending } = useFormStatus();
  return <Button type="submit" {...props} disabled={pending || props.disabled} />;
}
