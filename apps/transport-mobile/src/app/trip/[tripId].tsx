import {
  BOOKING_STATUS_LABELS,
  DEPART_EARLY_HOURS,
  networkClock,
  type DriverManifest,
} from '@vtp/shared-types';
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
  useCurrentUser,
  userMessage,
} from '@vtp/mobile-core';
import { useState } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { RefreshControl } from 'react-native';
import { tripLoad, tripWhen } from '@/lib/driver-trip';
import { noSignal, withTimeout } from '@/lib/no-signal';
import { tripWithPending } from '@/lib/outbox';
import { enqueue, useOutbox } from '@/lib/outbox-store';
import { SavedAt } from '@/lib/saved-at';
import { useRefreshOnFocus } from '@/lib/use-refresh-on-focus';

/** A driver's trip: when, which vehicle, and who boards and alights at each stop. */
export default function TripScreen() {
  const { tripId } = useLocalSearchParams<{ tripId: string }>();
  const manifest = useApi<DriverManifest>(`/me/driving/${encodeURIComponent(tripId)}/passengers`);
  useRefreshOnFocus(manifest.reload);
  const user = useCurrentUser();
  const outbox = useOutbox();
  const trip = manifest.data ? tripWithPending(manifest.data, outbox.pending) : undefined;
  const { api } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mark = async (step: 'depart' | 'arrive') => {
    setBusy(true);
    setError(null);
    // The time the driver tapped, kept if it has to be sent later (ADR-051).
    const at = new Date().toISOString();
    try {
      await withTimeout(
        api.request(`/me/driving/${encodeURIComponent(tripId)}/${step}`, { body: { at } }),
      );
      await manifest.reload();
    } catch (e) {
      const early =
        step === 'depart' &&
        Date.parse(trip!.departsAt) - DEPART_EARLY_HOURS * 3_600_000 > Date.parse(at);
      if (noSignal(e) && early) {
        setError(`Sin señal. La salida se marca desde ${DEPART_EARLY_HOURS} horas antes.`);
      } else if (noSignal(e)) {
        enqueue(api, user.id, {
          id: `${step}-${tripId}`,
          kind: step,
          tripId,
          at,
          label: `${step === 'depart' ? 'Salida' : 'Llegada'} · ${manifest.data?.route.name ?? ''}`,
        });
      } else {
        setError(userMessage(e));
      }
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
      {manifest.savedAt ? (
        <SavedAt savedAt={manifest.savedAt} />
      ) : manifest.error ? (
        <Banner tone="error">{manifest.error.userMessage}</Banner>
      ) : null}
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
            {trip.pendingStep ? (
              <Banner tone="warning">
                Marcado sin señal: se enviará solo cuando vuelva la señal.
              </Banner>
            ) : null}
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
