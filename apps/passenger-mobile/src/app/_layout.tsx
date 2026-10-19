import { AuthProvider, SplashScreen, useAuth } from '@vtp/mobile-core';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { api } from '@/lib/api';
import { SearchProvider } from '@/lib/search-context';

function RootNavigator() {
  const { state } = useAuth();
  if (state.status === 'loading' || state.status === 'unavailable') return <SplashScreen />;
  const signedIn = state.status === 'signedIn';
  return (
    <Stack>
      {/* Searching is public: no account needed to look up departures. */}
      <Stack.Screen name="index" options={{ title: 'VTP Pasajeros' }} />
      <Stack.Screen name="results" options={{ title: 'Salidas' }} />
      <Stack.Screen
        name="stop-picker"
        options={{ title: 'Elige la parada', presentation: 'modal' }}
      />
      <Stack.Protected guard={signedIn}>
        <Stack.Screen name="account" options={{ title: 'Mi cuenta' }} />
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
    <AuthProvider api={api}>
      <SearchProvider>
        <RootNavigator />
      </SearchProvider>
      <StatusBar style="auto" />
    </AuthProvider>
  );
}
