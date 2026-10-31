import { apiErrorText, type ApiErrorCode, type ApiErrorReason } from '@vtp/shared-types';

/**
 * Spanish text for an API error (the portal is Spanish): the reason's message, then the code's,
 * otherwise the API's own message, which for validation and older conflicts is specific enough.
 * Public pages in other languages call `apiErrorText` with their locale.
 */
export function errorMessage(
  code: ApiErrorCode | undefined,
  apiMessage?: string,
  reason?: ApiErrorReason,
): string {
  return apiErrorText('es', { code, reason, message: apiMessage });
}
