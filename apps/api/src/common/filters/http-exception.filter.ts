import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { ApiErrorCode, ApiErrorResponse, ApiFieldError } from '@vtp/shared-types';
import type { Request, Response } from 'express';
import { ApiException } from '../errors/api.exception.js';

const STATUS_TO_CODE: Partial<Record<number, ApiErrorCode>> = {
  [HttpStatus.BAD_REQUEST]: 'BAD_REQUEST',
  [HttpStatus.UNAUTHORIZED]: 'UNAUTHORIZED',
  [HttpStatus.FORBIDDEN]: 'FORBIDDEN',
  [HttpStatus.NOT_FOUND]: 'NOT_FOUND',
  [HttpStatus.CONFLICT]: 'CONFLICT',
  [HttpStatus.PAYLOAD_TOO_LARGE]: 'PAYLOAD_TOO_LARGE',
  [HttpStatus.UNPROCESSABLE_ENTITY]: 'VALIDATION_FAILED',
  [HttpStatus.TOO_MANY_REQUESTS]: 'RATE_LIMITED',
  [HttpStatus.SERVICE_UNAVAILABLE]: 'SERVICE_UNAVAILABLE',
};

/** Thrown by the validation pipe so the filter can emit field-level details. */
export class RequestValidationException extends HttpException {
  constructor(readonly details: ApiFieldError[]) {
    super('Request validation failed', HttpStatus.BAD_REQUEST);
  }
}

/**
 * Converts every error into the shared ApiErrorResponse shape.
 * Unexpected errors are logged in full server-side but surface only a generic message.
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<Request & { id?: string | number }>();
    const response = http.getResponse<Response>();

    const status =
      exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;

    let code: ApiErrorCode =
      STATUS_TO_CODE[status] ?? (status >= 500 ? 'INTERNAL_ERROR' : 'BAD_REQUEST');
    let message = 'Internal server error';
    let details: ApiFieldError[] | undefined;

    if (exception instanceof ApiException) {
      code = exception.code;
      message = exception.message;
    } else if (exception instanceof RequestValidationException) {
      code = 'VALIDATION_FAILED';
      message = exception.message;
      details = exception.details;
    } else if (exception instanceof HttpException && status < 500) {
      message = exception.message;
    } else {
      this.logger.error(
        exception instanceof Error ? (exception.stack ?? exception.message) : String(exception),
      );
    }

    const body: ApiErrorResponse = {
      error: {
        code,
        message,
        ...(details ? { details } : {}),
        ...(request.id !== undefined ? { requestId: String(request.id) } : {}),
        timestamp: new Date().toISOString(),
      },
    };
    response.status(status).json(body);
  }
}
