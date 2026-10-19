import { isApiErrorResponse, type ApiErrorCode, type ApiFieldError } from '@vtp/shared-types';

/** User-facing Spanish messages for API error codes. Same wording as the web portal. */
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

const NETWORK_MESSAGE = 'No pudimos conectar con el servidor. Revisa tu conexión.';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    /** `NETWORK` when the request never reached the API. */
    readonly code: ApiErrorCode | 'NETWORK',
    readonly apiMessage: string,
    readonly details: ApiFieldError[] = [],
  ) {
    super(`${status} ${code}: ${apiMessage}`);
    this.name = 'ApiError';
  }

  static async fromResponse(response: Response): Promise<ApiError> {
    const body: unknown = await response.json().catch(() => null);
    if (isApiErrorResponse(body)) {
      return new ApiError(
        response.status,
        body.error.code,
        body.error.message,
        body.error.details ?? [],
      );
    }
    return new ApiError(response.status, 'INTERNAL_ERROR', response.statusText);
  }

  static network(cause: unknown): ApiError {
    const error = new ApiError(0, 'NETWORK', NETWORK_MESSAGE);
    error.cause = cause;
    return error;
  }

  /** Spanish text to show the user. Validation and conflict messages from the API are specific enough. */
  get userMessage(): string {
    if (this.code === 'NETWORK') return NETWORK_MESSAGE;
    if (MESSAGES[this.code]) return MESSAGES[this.code]!;
    if (this.details.length) return this.details.map((d) => d.message).join('\n');
    return this.apiMessage || MESSAGES.INTERNAL_ERROR!;
  }
}

/** Message for any thrown value, for screens that catch broadly. */
export function userMessage(error: unknown): string {
  return error instanceof ApiError ? error.userMessage : MESSAGES.INTERNAL_ERROR!;
}
