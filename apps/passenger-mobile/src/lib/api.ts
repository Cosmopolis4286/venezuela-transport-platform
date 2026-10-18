import { ApiClient, secureTokenStore } from '@vtp/mobile-core';
import { env } from '@/config/env';

/** One client per installation; its tokens live in the device's secure storage. */
export const api = new ApiClient({
  baseUrl: env.apiBaseUrl,
  client: 'passenger',
  store: secureTokenStore('vtp.passenger.session'),
});
