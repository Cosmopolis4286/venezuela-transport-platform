import { BOOKING_STATUS_LABELS, networkClock, type DriverManifest } from '@vtp/shared-types';
import {
  Badge,
  Banner,
  Body,
  Button,
  Card,
  Heading,
  Row,
  Screen,
  Subheading,
  useApi,
  useAuth,
  userMessage,
} from '@vtp/mobile-core';
import { useState } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { RefreshControl } from 'react-native';
import { tripLoad, tripWhen } from '@/lib/driver-trip';
import { useRefreshOnFocus } from '@/lib/use-refresh-on-focus';

/** A driver's trip: when, which vehicle, and who boards and alights at each stop. */
export default function TripScreen() {
  const { tripId } = useLocalSearchParams<{ tripId: string }>();
  const manifest = useApi<DriverManifest>(`/me/driving/${encodeURIComponent(tripId)}/passengers`);
  useRefreshOnFocus(manifest.reload);
  const trip = manifest.data;
  const { api } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mark = async (step: 'depart' | 'arrive') => {
    setBusy(true);
    setError(null);
    try {
      await api.request(`/me/driving/${encodeURIComponent(tripId)}/${step}`, { method: 'POST' });
      await manifest.reload();
    } catch (e) {
      setError(userMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen
      refreshControl={
        <RefreshControl refreshing={manifest.loading} onRefresh={() => void manifest.reload()} />
      }
    >
      {manifest.error ? <Banner tone="error">{manifest.error.userMessage}</Banner> : null}
      {trip ? (
        <>
          <Heading>{trip.route.name}</Heading>
          <Body>{tripWhen(trip)}</Body>
          <Body muted>
            {trip.organization.tradeName ?? trip.organization.legalName} · {trip.from.name} →{' '}
            {trip.to.name}
          </Body>
          <Body muted>{tripLoad(trip)}</Body>

          <Card>
            <Subheading>Estado del viaje</Subheading>
            {trip.arrivedAt ? (
              <Badge
                label={`Salió ${networkClock(trip.departedAt!)} · llegó ${networkClock(trip.arrivedAt)}`}
                tone="success"
              />
            ) : trip.departedAt ? (
              <>
                <Badge
                  label={`En ruta desde las ${networkClock(trip.departedAt)}`}
                  tone="warning"
                />
                <Button title="Marcar llegada" loading={busy} onPress={() => void mark('arrive')} />
              </>
            ) : (
              <>
                <Body muted>Marca la salida al dejar el terminal (desde 2 horas antes).</Body>
                <Button title="Marcar salida" loading={busy} onPress={() => void mark('depart')} />
              </>
            )}
            {error ? <Banner tone="error">{error}</Banner> : null}
          </Card>

          <Subheading>Pasajeros ({trip.passengers.length})</Subheading>
          {trip.passengers.length === 0 ? (
            <Body muted>Todavía nadie ha reservado este viaje.</Body>
          ) : (
            trip.passengers.map((passenger) => (
              <Card key={passenger.seatNumber}>
                <Row>
                  <Body>
                    Puesto {passenger.seatNumber} · {passenger.firstName} {passenger.lastName}
                  </Body>
                </Row>
                <Body muted>
                  {passenger.from.name} → {passenger.to.name}
                </Body>
                <Row>
                  {passenger.boardedAt ? (
                    <Badge label={`Abordó ${networkClock(passenger.boardedAt)}`} tone="success" />
                  ) : passenger.bookingStatus === 'held' ? (
                    <Badge label={BOOKING_STATUS_LABELS.held} tone="warning" />
                  ) : (
                    <Badge label="Por abordar" />
                  )}
                </Row>
              </Card>
            ))
          )}
        </>
      ) : null}
    </Screen>
  );
}
