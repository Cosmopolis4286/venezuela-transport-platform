import type { Request } from 'express';

/** Something that hears about unexpected errors (an e-mail to the operator, a log, a test). */
export type ErrorSink = (error: unknown, request: Request & { id?: string | number }) => void;

let sink: ErrorSink | undefined;

/** Registered once at startup by `ErrorAlertsService`; the exception filter has no DI. */
export function setErrorSink(next: ErrorSink | undefined): void {
  sink = next;
}

/** Called by the exception filter for every unexpected (500) error. Never throws. */
export function reportUnexpectedError(
  error: unknown,
  request: Request & { id?: string | number },
): void {
  try {
    sink?.(error, request);
  } catch {
    // An alert must never break the response.
  }
}
