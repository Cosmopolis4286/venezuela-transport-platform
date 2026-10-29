import { HttpException, HttpStatus } from '@nestjs/common';
import type { ApiErrorCode, ApiErrorReason } from '@vtp/shared-types';

/**
 * Throw when the client needs a specific, stable error code (see API_ERROR_CODES).
 * The message is shown to end users: keep it short and free of secrets or PII.
 */
export class ApiException extends HttpException {
  constructor(
    readonly code: ApiErrorCode,
    message: string,
    status: HttpStatus,
    /** For clients: what exactly went wrong, when `code` is too coarse (see API_ERROR_REASONS). */
    readonly reason?: ApiErrorReason,
  ) {
    super(message, status);
  }

  /** `409 CONFLICT` with an optional stable reason. */
  static conflict(message: string, reason?: ApiErrorReason): ApiException {
    return new ApiException('CONFLICT', message, HttpStatus.CONFLICT, reason);
  }

  static invalidCredentials(): ApiException {
    return new ApiException('INVALID_CREDENTIALS', 'Invalid credentials', HttpStatus.UNAUTHORIZED);
  }

  static sessionExpired(): ApiException {
    return new ApiException(
      'SESSION_EXPIRED',
      'Session expired, sign in again',
      HttpStatus.UNAUTHORIZED,
    );
  }
}
