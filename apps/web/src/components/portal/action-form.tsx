'use client';

import {
  createContext,
  startTransition,
  useActionState,
  useContext,
  useEffect,
  useRef,
} from 'react';
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
 *
 * React resets a form after its action runs, even when the action fails, which would erase what
 * the user typed — and a reset `<select>` shows its first-render value, not the saved one. The form
 * is therefore submitted manually and only "add" forms (`resetOnSuccess`) are cleared on success.
 */
export function ActionForm({
  action,
  hidden,
  children,
  className,
  resetOnSuccess = false,
}: {
  action: (state: FormState, form: FormData) => Promise<FormState>;
  hidden?: Record<string, string>;
  children: React.ReactNode;
  className?: string;
  /** Clear the fields after a successful submit (forms that add something new). */
  resetOnSuccess?: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, initialFormState);
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (resetOnSuccess && state.success) formRef.current?.reset();
  }, [state, resetOnSuccess]);
  return (
    <form
      ref={formRef}
      action={formAction}
      onSubmit={(event) => {
        event.preventDefault();
        // Keep the clicked button's name/value (e.g. decision=approve).
        const submitter = (event.nativeEvent as SubmitEvent).submitter;
        const data = new FormData(event.currentTarget, submitter);
        startTransition(() => formAction(data));
      }}
      className={cn('flex flex-col gap-3', className)}
    >
      {Object.entries(hidden ?? {}).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <PendingContext value={pending}>{children}</PendingContext>
      {state.error ? <Alert variant="destructive">{state.error}</Alert> : null}
      {state.success ? <Alert variant="success">{state.success}</Alert> : null}
    </form>
  );
}

const PendingContext = createContext(false);

/** Submit button disabled while its form's action is running. */
export function SubmitButton(props: React.ComponentProps<typeof Button>) {
  const { pending: nativePending } = useFormStatus();
  const pending = useContext(PendingContext) || nativePending;
  return <Button type="submit" {...props} disabled={pending || props.disabled} />;
}
