import type { ConfigContext, ExpoConfig } from 'expo/config';

/**
 * `app.json` plus what comes from the environment: the Google Maps key that Android builds need
 * for the live map of the ride (`GOOGLE_MAPS_ANDROID_API_KEY`; iOS uses Apple Maps, Expo Go
 * needs none).
 */
export default ({ config }: ConfigContext): ExpoConfig => ({
  ...(config as ExpoConfig),
  plugins: [
    ...(config.plugins ?? []),
    [
      'react-native-maps',
      { androidGoogleMapsApiKey: process.env.GOOGLE_MAPS_ANDROID_API_KEY || undefined },
    ],
  ],
});
