import { BOOKING_STATUS_LABELS, networkClock, type DriverManifest } from '@vtp/shared-types';
import {
  Badge,
  Banner,
  Body,
  Card,
  Heading,
  Row,
  Screen,
  Subheading,
  useApi,
} from '@vtp/mobile-core';
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
