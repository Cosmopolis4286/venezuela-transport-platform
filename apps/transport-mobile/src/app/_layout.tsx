import { AuthProvider, SplashScreen, useAuth } from '@vtp/mobile-core';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { api } from '@/lib/api';

function RootNavigator() {
  const { state } = useAuth();
  if (state.status === 'loading' || state.status === 'unavailable') return <SplashScreen />;
  const signedIn = state.status === 'signedIn';
  return (
    <Stack>
      <Stack.Protected guard={signedIn}>
        <Stack.Screen name="index" options={{ title: 'VTP Transportistas' }} />
        <Stack.Screen name="application/index" options={{ title: 'Mi solicitud' }} />
        <Stack.Screen name="application/edit" options={{ title: 'Datos de la solicitud' }} />
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
      <RootNavigator />
      <StatusBar style="auto" />
    </AuthProvider>
  );
}
