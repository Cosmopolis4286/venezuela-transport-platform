import {
  AuthProvider,
  I18nProvider,
  SplashScreen,
  useAuth,
  usePushNotifications,
} from '@vtp/mobile-core';
import { Stack, useRouter } from 'expo-router';
import { useCallback } from 'react';
import { StatusBar } from 'expo-status-bar';
import { api } from '@/lib/api';
import { useSendPending } from '@/lib/outbox-store';
import { responseCache } from '@/lib/response-cache';

function RootNavigator() {
  const { state } = useAuth();
  const router = useRouter();
  const signedIn = state.status === 'signedIn';
  // A tapped notification opens the assigned trip or the taxi board.
  const openNotice = useCallback(
    (data: Record<string, unknown>) => {
      if (typeof data.tripId === 'string') router.push(`/trip/${data.tripId}`);
      else if (typeof data.rideId === 'string') router.push('/taxi');
    },
    [router],
  );
  usePushNotifications(api, 'transport', signedIn, openNotice);
  // Cash sales, departures and arrivals done without signal go out when it comes back (ADR-051).
  useSendPending(api, signedIn ? state.user.id : null);
  if (state.status === 'loading' || state.status === 'unavailable') return <SplashScreen />;
  return (
    <Stack>
      <Stack.Protected guard={signedIn}>
        <Stack.Screen name="index" options={{ title: 'VTP Transportistas' }} />
        <Stack.Screen name="application/index" options={{ title: 'Mi solicitud' }} />
        <Stack.Screen name="application/edit" options={{ title: 'Datos de la solicitud' }} />
        <Stack.Screen name="scan" options={{ title: 'Validar boletos' }} />
        <Stack.Screen name="trip/[tripId]" options={{ title: 'Mi viaje' }} />
        <Stack.Screen name="taxi" options={{ title: 'Taxis y motos' }} />
        <Stack.Screen name="earnings" options={{ title: 'Mis cobros' }} />
        <Stack.Screen name="cash" options={{ title: 'Ventas en efectivo' }} />
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
    // Staff screens are Spanish only for now (passenger app: es, en, pt-BR).
    <I18nProvider fixedLocale="es">
      {/* Saved screens and profile: the app opens and works without signal (ADR-051). */}
      <AuthProvider api={api} cache={responseCache}>
        <RootNavigator />
        <StatusBar style="auto" />
      </AuthProvider>
    </I18nProvider>
  );
}
