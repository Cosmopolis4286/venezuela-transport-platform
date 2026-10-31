import {
  apiErrorText,
  isApiErrorResponse,
  type ApiErrorCode,
  type ApiErrorReason,
  type ApiFieldError,
} from '@vtp/shared-types';
import { currentLocale } from '../i18n/active-locale';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    /** `NETWORK` when the request never reached the API. */
    readonly code: ApiErrorCode | 'NETWORK',
    readonly apiMessage: string,
    readonly details: ApiFieldError[] = [],
    /** What exactly went wrong, when `code` is too coarse (see API_ERROR_REASONS). */
    readonly reason?: ApiErrorReason,
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
        body.error.reason,
      );
    }
    return new ApiError(response.status, 'INTERNAL_ERROR', response.statusText);
  }

  static network(cause: unknown): ApiError {
    const error = new ApiError(0, 'NETWORK', 'Network request failed');
    error.cause = cause;
    return error;
  }

  /**
   * Text to show the user, in the app's language: the reason's or the code's message, else the
   * validation details or the API's own message.
   */
  get userMessage(): string {
    return apiErrorText(currentLocale(), {
      code: this.code,
      reason: this.reason,
      message: this.details.map((d) => d.message).join('\n') || this.apiMessage,
    });
  }
}

/** Message for any thrown value, for screens that catch broadly. */
export function userMessage(error: unknown): string {
  return error instanceof ApiError ? error.userMessage : apiErrorText(currentLocale(), {});
}
