import {
  Badge,
  Banner,
  Body,
  Button,
  Card,
  Heading,
  Screen,
  Subheading,
  useApi,
  useAuth,
  userMessage,
} from '@vtp/mobile-core';
import {
  TAXI_DIRECTION_LABELS,
  TAXI_RIDE_STATUS_LABELS,
  formatMoney,
  taxiRideHint,
  vehicleName,
  type TaxiRide,
} from '@vtp/shared-types';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { RefreshControl } from 'react-native';
import { driverLine, isOpenRide } from '@/lib/taxi';
import { formatClock, useSecondsLeft } from '@/lib/use-countdown';

/** While the ride is open, it is reloaded this often to show the taxi as soon as one takes it. */
const POLL_MS = 5000;

const TONES = {
  requested: 'warning',
  accepted: 'success',
  in_progress: 'success',
  completed: 'neutral',
  cancelled: 'danger',
  expired: 'danger',
} as const;

export default function TaxiRideScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { api } = useAuth();
  const ride = useApi<TaxiRide>(`/me/taxi-rides/${encodeURIComponent(id)}`);
  const { reload, mutate } = ride;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const data = ride.data;
  const open = data ? isOpenRide(data) : false;
  const secondsLeft = useSecondsLeft(data?.status === 'requested' ? data.expiresAt : null);

  useEffect(() => {
    if (!open) return;
    const timer = setInterval(() => void reload(), POLL_MS);
    return () => clearInterval(timer);
  }, [open, reload]);

  const cancel = async () => {
    setBusy(true);
    setError(null);
    try {
      mutate(await api.request<TaxiRide>(`/me/taxi-rides/${id}/cancel`, { method: 'POST' }));
    } catch (e) {
      setError(userMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen
      refreshControl={<RefreshControl refreshing={ride.loading} onRefresh={() => void reload()} />}
    >
      {ride.error ? <Banner tone="error">{ride.error.userMessage}</Banner> : null}
      {data ? (
        <>
          <Heading>{TAXI_DIRECTION_LABELS[data.direction]}</Heading>
          <Badge label={TAXI_RIDE_STATUS_LABELS[data.status]} tone={TONES[data.status]} />
          <Body>{taxiRideHint(data)}</Body>
          {data.status === 'requested' ? (
            <Body muted>La solicitud espera {formatClock(secondsLeft)} más.</Body>
          ) : null}

          {data.vehicle ? (
            <Card>
              <Subheading>Tu taxi</Subheading>
              <Body>Placa {vehicleName(data.vehicle)}</Body>
              <Body>{driverLine(data.driver)}</Body>
              {data.organization ? (
                <Body muted>{data.organization.tradeName ?? data.organization.legalName}</Body>
              ) : null}
              {data.fare ? (
                <Body>Tarifa: {formatMoney(data.fare.amount, data.fare.currency)}</Body>
              ) : null}
            </Card>
          ) : null}

          <Card>
            <Body>
              {data.direction === 'from_terminal' ? 'Desde' : 'Hacia'} {data.terminal.name} (
              {data.terminal.city})
            </Body>
            <Body muted>
              {data.direction === 'from_terminal' ? 'Destino' : 'Te buscan en'}: {data.address}
            </Body>
            <Body muted>
              {data.passengers} {data.passengers === 1 ? 'pasajero' : 'pasajeros'}
              {data.notes ? ` · ${data.notes}` : ''}
            </Body>
          </Card>

          {error ? <Banner tone="error">{error}</Banner> : null}
          {data.status === 'requested' || data.status === 'accepted' ? (
            <Button
              variant="secondary"
              title="Cancelar el taxi"
              loading={busy}
              onPress={() => void cancel()}
            />
          ) : null}
          {!open ? (
            <Button title="Pedir otro taxi" onPress={() => router.replace('/taxi')} />
          ) : null}
        </>
      ) : null}
    </Screen>
  );
}
