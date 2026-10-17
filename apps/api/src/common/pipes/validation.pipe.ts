import { ValidationPipe, type ValidationError } from '@nestjs/common';
import type { ApiFieldError } from '@vtp/shared-types';
import { RequestValidationException } from '../filters/http-exception.filter.js';

function flatten(errors: ValidationError[], parent = ''): ApiFieldError[] {
  return errors.flatMap((error) => {
    const field = parent ? `${parent}.${error.property}` : error.property;
    const own = Object.values(error.constraints ?? {}).map((message) => ({ field, message }));
    return [...own, ...flatten(error.children ?? [], field)];
  });
}

/**
 * Global request validation for class-validator DTOs: strips unknown properties,
 * rejects requests that send them, and transforms payloads into DTO instances.
 */
export function createValidationPipe(): ValidationPipe {
  return new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    // Never echo submitted values back to the client (they may contain PII).
    validationError: { target: false, value: false },
    exceptionFactory: (errors) => new RequestValidationException(flatten(errors)),
  });
}
