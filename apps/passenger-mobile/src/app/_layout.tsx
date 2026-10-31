import { AuthProvider, I18nProvider, SplashScreen, useAuth } from '@vtp/mobile-core';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useT } from '@/i18n/use-t';
import { api } from '@/lib/api';
import { BookingDraftProvider } from '@/lib/booking-draft';
import { SearchProvider } from '@/lib/search-context';

function RootNavigator() {
  const { state } = useAuth();
  const { t } = useT();
  if (state.status === 'loading' || state.status === 'unavailable') return <SplashScreen />;
  const signedIn = state.status === 'signedIn';
  return (
    <Stack>
      {/* Searching is public: no account needed to look up departures. */}
      <Stack.Screen name="index" options={{ title: t.nav.home }} />
      <Stack.Screen name="results" options={{ title: t.nav.results }} />
      <Stack.Screen name="trip" options={{ title: t.nav.trip }} />
      <Stack.Screen
        name="stop-picker"
        options={{ title: t.nav.stopPicker, presentation: 'modal' }}
      />
      <Stack.Protected guard={signedIn}>
        <Stack.Screen name="account" options={{ title: t.nav.account }} />
        <Stack.Screen name="passengers" options={{ title: t.nav.passengers }} />
        <Stack.Screen name="booking/[id]" options={{ title: t.nav.booking }} />
        <Stack.Screen name="bookings" options={{ title: t.nav.bookings }} />
        <Stack.Screen name="taxi/index" options={{ title: t.nav.taxiRequest }} />
        <Stack.Screen name="taxi/[id]" options={{ title: t.nav.taxiRide }} />
      </Stack.Protected>
      <Stack.Protected guard={!signedIn}>
        <Stack.Screen name="sign-in" options={{ headerShown: false }} />
        <Stack.Screen name="register" options={{ headerShown: false }} />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  return (
    // The device's language by default; the passenger can choose another on the home screen.
    <I18nProvider>
      <AuthProvider api={api}>
        <SearchProvider>
          <BookingDraftProvider>
            <RootNavigator />
          </BookingDraftProvider>
        </SearchProvider>
        <StatusBar style="auto" />
      </AuthProvider>
    </I18nProvider>
  );
}
