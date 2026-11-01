import type { PushApp, RegisterPushDeviceRequest } from '@vtp/shared-types';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { useEffect } from 'react';
import { Platform } from 'react-native';
import type { ApiClient } from '../api/client';
import { currentLocale } from '../i18n/active-locale';

/** The token this device registered for the signed-in person, to remove it on sign-out. */
let registeredToken: string | null = null;

// Notices that arrive while the app is open still show as a banner.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

/**
 * Asks for permission and registers this device's Expo push token with the API. Needs an EAS
 * project id (`extra.eas.projectId` in app.json): without one, or on the web, it does nothing and
 * the person still gets e-mails. Never throws: push is a convenience.
 */
export async function registerForPush(api: ApiClient, app: PushApp): Promise<void> {
  try {
    if (Platform.OS === 'web') return;
    const projectId = (Constants.expoConfig?.extra?.eas as { projectId?: string } | undefined)
      ?.projectId;
    if (!projectId) return;
    if (Platform.OS === 'android') {
      // Android 13+ asks for permission only once a channel exists. 3 = default importance.
      await Notifications.setNotificationChannelAsync('default', { name: 'VTP', importance: 3 });
    }
    let { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') ({ status } = await Notifications.requestPermissionsAsync());
    if (status !== 'granted') return;
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
    const body: RegisterPushDeviceRequest = {
      token,
      app,
      platform: Platform.OS === 'ios' ? 'ios' : 'android',
      locale: currentLocale(),
    };
    await api.request('/me/push-devices', { body });
    registeredToken = token;
  } catch {
    // Permissions denied, no Play Services, offline…: e-mail still works.
  }
}

/** Removes this device from the person's notices; called before signing out. */
export async function unregisterFromPush(api: ApiClient): Promise<void> {
  const token = registeredToken;
  registeredToken = null;
  if (!token) return;
  await api
    .request('/me/push-devices', { method: 'DELETE', body: { token } })
    .catch(() => undefined);
}

/**
 * Registers for push while someone is signed in, and opens the screen a tapped notification is
 * about (`data` carries `bookingId`, `tripId` or `rideId`).
 */
export function usePushNotifications(
  api: ApiClient,
  app: PushApp,
  signedIn: boolean,
  onOpen: (data: Record<string, unknown>) => void,
): void {
  useEffect(() => {
    if (signedIn) void registerForPush(api, app);
  }, [api, app, signedIn]);

  useEffect(() => {
    if (Platform.OS === 'web') return;
    const subscription = Notifications.addNotificationResponseReceivedListener((response) =>
      onOpen(response.notification.request.content.data ?? {}),
    );
    return () => subscription.remove();
  }, [onOpen]);
}
