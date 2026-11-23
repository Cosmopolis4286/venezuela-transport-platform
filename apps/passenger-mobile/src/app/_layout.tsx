import {
  AuthProvider,
  Button,
  I18nProvider,
  SplashScreen,
  useAuth,
  usePushNotifications,
} from '@vtp/mobile-core';
import { Stack, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { useT } from '@/i18n/use-t';
import { api } from '@/lib/api';
import { SavedTicketsView } from '@/components/saved-tickets-view';
import { BookingDraftProvider } from '@/lib/booking-draft';
import { clearSavedTickets, useKeepTicketsSaved, useSavedTickets } from '@/lib/saved-tickets-store';
import { SearchProvider } from '@/lib/search-context';

function RootNavigator() {
  const { state } = useAuth();
  const { t } = useT();
  const router = useRouter();
  const signedIn = state.status === 'signedIn';
  // A guest (bought without registering) can still sign in or register: its trips come along.
  const registered = signedIn && !state.user.guest;
  // A tapped notification opens the booking or taxi ride it is about.
  const openNotice = useCallback(
    (data: Record<string, unknown>) => {
      if (typeof data.bookingId === 'string') router.push(`/booking/${data.bookingId}`);
      else if (typeof data.rideId === 'string') router.push(`/taxi/${data.rideId}`);
      else if (typeof data.tripPackId === 'string') router.push(`/trip-packs/${data.tripPackId}`);
    },
    [router],
  );
  usePushNotifications(api, 'passenger', signedIn, openNotice);
  // Paid tickets stay on the phone to show without signal (ADR-050).
  const userId = signedIn ? state.user.id : null;
  useKeepTicketsSaved(api, userId);
  const saved = useSavedTickets();
  const [showSaved, setShowSaved] = useState(false);
  const previous = useRef(state.status);
  useEffect(() => {
    const was = previous.current;
    previous.current = state.status;
    // Signing out (or deleting the account) deletes them; a session that just expired keeps them.
    const signedOutOnPurpose =
      state.status === 'signedOut' &&
      !state.expired &&
      (was === 'signedIn' || was === 'unavailable');
    // Another account on this phone never sees the previous one's tickets.
    const otherAccount = userId !== null && saved.userId !== null && saved.userId !== userId;
    if (signedOutOnPurpose || otherAccount) clearSavedTickets();
  }, [state, userId, saved.userId]);

  if (state.status === 'loading') return <SplashScreen />;
  if (state.status === 'unavailable') {
    // No signal to load the session: the saved tickets are still there.
    if (showSaved) return <SavedTicketsView onBack={() => setShowSaved(false)} />;
    return (
      <SplashScreen>
        {saved.bookings.length ? (
          <Button
            variant="secondary"
            title={t.saved.button(saved.bookings.length)}
            onPress={() => setShowSaved(true)}
          />
        ) : null}
      </SplashScreen>
    );
  }
  return (
    <Stack>
      {/* Searching is public: no account needed to look up departures. */}
      <Stack.Screen name="index" options={{ title: t.nav.home }} />
      <Stack.Screen name="results" options={{ title: t.nav.results }} />
      <Stack.Screen name="trip" options={{ title: t.nav.trip }} />
      <Stack.Screen name="saved-tickets" options={{ title: t.nav.savedTickets }} />
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
        <Stack.Screen name="trip-packs/index" options={{ title: t.nav.tripPacks }} />
        <Stack.Screen name="trip-packs/[id]" options={{ title: t.nav.tripPack }} />
      </Stack.Protected>
      <Stack.Protected guard={!registered}>
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
