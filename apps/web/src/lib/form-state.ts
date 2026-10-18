/** Shared return shape of form Server Actions (consumed with useActionState). */
export interface FormState {
  error?: string;
  success?: string;
  /** Field name → message, from API validation details. */
  fieldErrors?: Record<string, string>;
}

export const initialFormState: FormState = {};

/** Rejects absolute and protocol-relative URLs so `?next=` cannot redirect off-site. */
export function safeNextPath(
  next: FormDataEntryValue | null | undefined,
  fallback = '/portal',
): string {
  const value = typeof next === 'string' ? next : '';
  return value.startsWith('/') && !value.startsWith('//') && !value.startsWith('/\\')
    ? value
    : fallback;
}
