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
  type TripAvailability,
} from '@vtp/shared-types';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator } from 'react-native';
import { SeatMap } from '@/components/seat-map';
import { useT } from '@/i18n/use-t';
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
  const { t, shared, locale } = useT();
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
        {extraDays ? t.dayOffset(extraDays) : ''}
      </Heading>
      <Body muted>
        {data.operator.tradeName ?? data.operator.legalName} ·{' '}
        {shared.serviceClass[data.serviceClass]} · {longDate(data.departsAt, locale)}
      </Body>
      <Body muted>
        {data.from.name} → {data.to.name}
      </Body>
      {!data.bookable ? (
        <Banner tone="info">{data.fare ? t.trip.departed : t.trip.counterOnly}</Banner>
      ) : (
        <>
          <Subheading>{t.trip.chooseSeats}</Subheading>
          <Body muted>{t.trip.seatsHelp(free, MAX_SEATS_PER_BOOKING)}</Body>
          <SeatMap trip={data} selected={selected} onToggle={toggle} />
          {selected.length ? (
            <Body>
              {t.seats(selected.length)} ·{' '}
              {formatMoney(
                (Number(data.fare!.amount) * selected.length).toFixed(2),
                data.fare!.currency,
                locale,
              )}
            </Body>
          ) : null}
          {state.status === 'signedIn' ? (
            <Button
              title={t.trip.continue}
              disabled={!selected.length}
              onPress={() => {
                draft.start(data, selected);
                router.push('/passengers');
              }}
            />
          ) : (
            <>
              <Banner tone="info">{t.trip.signInToHold}</Banner>
              <Button
                title={t.trip.signIn}
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
