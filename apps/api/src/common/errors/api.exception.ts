import { HttpException, HttpStatus } from '@nestjs/common';
import type { ApiErrorCode } from '@vtp/shared-types';

/**
 * Throw when the client needs a specific, stable error code (see API_ERROR_CODES).
 * The message is shown to end users: keep it short and free of secrets or PII.
 */
export class ApiException extends HttpException {
  constructor(
    readonly code: ApiErrorCode,
    message: string,
    status: HttpStatus,
  ) {
    super(message, status);
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
