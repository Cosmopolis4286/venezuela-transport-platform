import type { ApiErrorCode } from '@vtp/shared-types';

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

/** Prefers our Spanish message; for validation and conflicts the API message is specific enough. */
export function errorMessage(code: ApiErrorCode | undefined, apiMessage?: string): string {
  if (code && MESSAGES[code]) return MESSAGES[code];
  return apiMessage || MESSAGES.INTERNAL_ERROR!;
}
