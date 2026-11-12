import {
  Banner,
  Body,
  Button,
  Heading,
  LegalLinks,
  Screen,
  Segmented,
  Subheading,
  useApi,
  useAuth,
  useColors,
  userMessage,
} from '@vtp/mobile-core';
import {
  daysBetween,
  localTime,
  longDate,
  MAX_SEATS_PER_BOOKING,
  type TripAvailability,
} from '@vtp/shared-types';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator } from 'react-native';
import { PriceBreakdown } from '@/components/price-breakdown';
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
  const { state, continueAsGuest } = useAuth();
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);
  const draft = useBookingDraft();
  const colors = useColors();
  const { t, shared, locale } = useT();
  const [selected, setSelected] = useState<string[]>([]);
  const [count, setCount] = useState('1');
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

  const open = data.headwayMinutes !== null && data.lastDepartsAt !== null;
  const counts = Array.from(
    { length: Math.min(MAX_SEATS_PER_BOOKING, Math.max(free, 0)) },
    (_, i) => String(i + 1),
  );
  /**
   * Not signed in: buy without an account (a guest kept on this phone, ADR-034) and go on with
   * `next`; or sign in. Continuing accepts the Terms and Privacy Policy, as the line says.
   */
  const startWithout = (next: () => void) => (
    <>
      <Button
        title={t.trip.continueNoAccount}
        loading={joining}
        onPress={() => {
          setJoining(true);
          setJoinError(null);
          continueAsGuest()
            .then(next)
            .catch((e: unknown) => setJoinError(userMessage(e)))
            .finally(() => setJoining(false));
        }}
      />
      <LegalLinks prefix="continue" />
      {joinError ? <Banner tone="error">{joinError}</Banner> : null}
      <Button
        title={t.trip.haveAccount}
        variant="secondary"
        onPress={() => router.push('/sign-in')}
      />
    </>
  );

  if (open) {
    const passengers = Math.min(Number(count), counts.length);
    return (
      <Screen>
        <Heading>{data.route.name}</Heading>
        <Body muted>
          {data.operator.tradeName ?? data.operator.legalName} · {longDate(data.departsAt, locale)}
        </Body>
        <Body muted>
          {data.from.name} → {data.to.name}
        </Body>
        {!data.bookable ? (
          <Banner tone="info">{data.fare ? t.trip.departed : t.trip.counterOnly}</Banner>
        ) : (
          <>
            <Banner tone="info">
              {t.trip.openTicket(localTime(data.departsAt), localTime(data.lastDepartsAt!))}
            </Banner>
            {counts.length ? (
              <Segmented
                label={t.trip.howMany}
                options={counts.map((value) => ({ value, label: value }))}
                value={String(passengers)}
                onChange={setCount}
              />
            ) : null}
            {passengers > 0 ? (
              <PriceBreakdown
                label={t.passengerCount(passengers)}
                fares={(Number(data.fare!.amount) * passengers).toFixed(2)}
                rate={data.serviceFeeRate}
                currency={data.fare!.currency}
              />
            ) : null}
            {state.status === 'signedIn' ? (
              <Button
                title={t.trip.continue}
                disabled={passengers < 1}
                onPress={() => {
                  // Open tickets carry no seat: the API numbers them.
                  draft.start(
                    data,
                    Array.from({ length: passengers }, () => ''),
                  );
                  router.push('/passengers');
                }}
              />
            ) : passengers > 0 ? (
              startWithout(() => {
                draft.start(
                  data,
                  Array.from({ length: passengers }, () => ''),
                );
                router.push('/passengers');
              })
            ) : null}
          </>
        )}
      </Screen>
    );
  }

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
            <PriceBreakdown
              label={t.seats(selected.length)}
              fares={(Number(data.fare!.amount) * selected.length).toFixed(2)}
              rate={data.serviceFeeRate}
              currency={data.fare!.currency}
            />
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
          ) : selected.length ? (
            startWithout(() => {
              draft.start(data, selected);
              router.push('/passengers');
            })
          ) : (
            <Body muted>{t.trip.chooseSeats}</Body>
          )}
        </>
      )}
    </Screen>
  );
}
