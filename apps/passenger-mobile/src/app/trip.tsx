import {
  Banner,
  Body,
  Button,
  Heading,
  Screen,
  Subheading,
  useApi,
  useAuth,
  useColors,
} from '@vtp/mobile-core';
import {
  daysBetween,
  formatMoney,
  localTime,
  longDate,
  MAX_SEATS_PER_BOOKING,
  SERVICE_CLASS_LABELS,
  type TripAvailability,
} from '@vtp/shared-types';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator } from 'react-native';
import { SeatMap } from '@/components/seat-map';
import { useBookingDraft } from '@/lib/booking-draft';
import { useSearch } from '@/lib/search-context';
import { useRefreshOnFocus } from '@/lib/use-refresh-on-focus';

/** Seat selection for one departure. Public; holding the seats needs an account. */
export default function TripScreen() {
  const { scheduleId, serviceDate } = useLocalSearchParams<{
    scheduleId: string;
    serviceDate: string;
  }>();
  const { from, to } = useSearch();
  const { state } = useAuth();
  const draft = useBookingDraft();
  const colors = useColors();
  const [selected, setSelected] = useState<string[]>([]);
  const query =
    from && to && scheduleId && serviceDate
      ? `/trips/availability?${new URLSearchParams({ scheduleId, serviceDate, from: from.id, to: to.id })}`
      : null;
  const trip = useApi<TripAvailability>(query, { auth: false });
  // Coming back (e.g. after losing a seat to someone else): fresh availability, empty selection.
  const { reload } = trip;
  useRefreshOnFocus(
    useCallback(async () => {
      setSelected([]);
      await reload();
    }, [reload]),
  );
  if (!query) return <Redirect href="/" />;
  if (!trip.data) {
    return (
      <Screen>
        {trip.error ? (
          <Banner tone="error">{trip.error.userMessage}</Banner>
        ) : (
          <ActivityIndicator color={colors.text} />
        )}
      </Screen>
    );
  }

  const data = trip.data;
  const free = data.capacity - data.takenSeats.length;
  const toggle = (seat: string) =>
    setSelected((current) =>
      current.includes(seat)
        ? current.filter((s) => s !== seat)
        : current.length >= MAX_SEATS_PER_BOOKING
          ? current
          : [...current, seat],
    );
  const extraDays = daysBetween(data.departsAt, data.arrivesAt);

  return (
    <Screen>
      <Heading>
        {localTime(data.departsAt)} → {localTime(data.arrivesAt)}
        {extraDays ? ` (+${extraDays} d)` : ''}
      </Heading>
      <Body muted>
        {data.operator.tradeName ?? data.operator.legalName} ·{' '}
        {SERVICE_CLASS_LABELS[data.serviceClass]} · {longDate(data.departsAt)}
      </Body>
      <Body muted>
        {data.from.name} → {data.to.name}
      </Body>
      {!data.bookable ? (
        <Banner tone="info">
          {data.fare ? 'Esta salida ya partió.' : 'Este tramo se vende solo en la taquilla.'}
        </Banner>
      ) : (
        <>
          <Subheading>Elige tus puestos</Subheading>
          <Body muted>
            {free} libres · hasta {MAX_SEATS_PER_BOOKING} por reserva · el frente del vehículo está
            arriba
          </Body>
          <SeatMap trip={data} selected={selected} onToggle={toggle} />
          {selected.length ? (
            <Body>
              {selected.length} {selected.length === 1 ? 'puesto' : 'puestos'} ·{' '}
              {formatMoney(
                (Number(data.fare!.amount) * selected.length).toFixed(2),
                data.fare!.currency,
              )}
            </Body>
          ) : null}
          {state.status === 'signedIn' ? (
            <Button
              title="Continuar"
              disabled={!selected.length}
              onPress={() => {
                draft.start(data, selected);
                router.push('/passengers');
              }}
            />
          ) : (
            <>
              <Banner tone="info">Inicia sesión para apartar tus puestos.</Banner>
              <Button
                title="Iniciar sesión"
                variant="secondary"
                onPress={() => router.push('/sign-in')}
              />
            </>
          )}
        </>
      )}
    </Screen>
  );
}
