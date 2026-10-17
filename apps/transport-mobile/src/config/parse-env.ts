export function normaliseApiBaseUrl(value: string | undefined): string {
  if (!value || !/^https?:\/\/[^\s/]+/.test(value)) {
    throw new Error('EXPO_PUBLIC_API_BASE_URL is missing or invalid. See .env.example.');
  }
  return value.replace(/\/+$/, '');
}
