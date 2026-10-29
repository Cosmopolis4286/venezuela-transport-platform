import {
  API_ERROR_REASON_MESSAGES,
  type ApiErrorCode,
  type ApiErrorReason,
} from '@vtp/shared-types';

/** User-facing Spanish messages for API error codes. Field-level details are shown as returned. */
const MESSAGES: Partial<Record<ApiErrorCode, string>> = {
  INVALID_CREDENTIALS: 'Correo o contraseña incorrectos.',
  SESSION_EXPIRED: 'Tu sesión expiró. Inicia sesión de nuevo.',
  UNAUTHORIZED: 'Inicia sesión para continuar.',
  FORBIDDEN: 'No tienes permiso para hacer esto.',
  NOT_FOUND: 'No encontramos lo que buscas.',
  OTP_INVALID: 'El código no es válido.',
  OTP_EXPIRED: 'El código expiró o hubo demasiados intentos. Pide uno nuevo.',
  RATE_LIMITED: 'Demasiados intentos. Espera un momento e inténtalo de nuevo.',
  SERVICE_UNAVAILABLE: 'El servicio no está disponible en este momento.',
  PAYLOAD_TOO_LARGE: 'El archivo es demasiado grande.',
  INTERNAL_ERROR: 'Ocurrió un error inesperado. Inténtalo de nuevo.',
};

/**
 * Prefers our Spanish message: the reason's, then the code's. Otherwise the API's message, which
 * for validation and older conflicts is specific enough.
 */
export function errorMessage(
  code: ApiErrorCode | undefined,
  apiMessage?: string,
  reason?: ApiErrorReason,
): string {
  if (reason && API_ERROR_REASON_MESSAGES[reason]) return API_ERROR_REASON_MESSAGES[reason];
  if (code && MESSAGES[code]) return MESSAGES[code];
  return apiMessage || MESSAGES.INTERNAL_ERROR!;
}
