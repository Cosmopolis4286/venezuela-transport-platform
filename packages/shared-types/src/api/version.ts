/** Current public REST API version. Breaking changes require a new version. */
export const API_VERSION = '1' as const;

/** Path prefix every REST endpoint is served under, e.g. `/api/v1/health`. */
export const API_BASE_PATH = `/api/v${API_VERSION}` as const;
