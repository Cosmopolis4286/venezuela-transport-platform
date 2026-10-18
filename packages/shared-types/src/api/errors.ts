/**
 * Stable, machine-readable error codes. Clients branch on `code`, never on `message`.
 * Add new codes freely; renaming or removing one is a breaking change.
 */
export const API_ERROR_CODES = [
  'BAD_REQUEST',
  'VALIDATION_FAILED',
  'UNAUTHORIZED',
  'INVALID_CREDENTIALS',
  'SESSION_EXPIRED',
  'OTP_INVALID',
  'OTP_EXPIRED',
  'FORBIDDEN',
  'NOT_FOUND',
  'CONFLICT',
  'RATE_LIMITED',
  'SERVICE_UNAVAILABLE',
  'INTERNAL_ERROR',
] as const;

export type ApiErrorCode = (typeof API_ERROR_CODES)[number];

/** One problem with a specific input field. */
export interface ApiFieldError {
  /** Dotted path to the offending field, e.g. `passenger.documentNumber`. */
  field: string;
  message: string;
}

/** Body returned by every non-2xx API response. */
export interface ApiErrorResponse {
  error: {
    code: ApiErrorCode;
    /** Human-readable summary, safe to show to end users. Never contains secrets or PII. */
    message: string;
    details?: ApiFieldError[];
    /** Correlates the response with server logs. Include it in support requests. */
    requestId?: string;
    /** ISO-8601 timestamp. */
    timestamp: string;
  };
}

export function isApiErrorResponse(value: unknown): value is ApiErrorResponse {
  if (typeof value !== 'object' || value === null || !('error' in value)) return false;
  const error = (value as { error: unknown }).error;
  return (
    typeof error === 'object' &&
    error !== null &&
    typeof (error as { code?: unknown }).code === 'string' &&
    (API_ERROR_CODES as readonly string[]).includes((error as { code: string }).code) &&
    typeof (error as { message?: unknown }).message === 'string'
  );
}
