import {
  Badge,
  Banner,
  Body,
  Button,
  Card,
  Heading,
  Row,
  Screen,
  useApi,
  useColors,
} from '@vtp/mobile-core';
import {
  daysBetween,
  formatDuration,
  formatMoney,
  localTime,
  longDate,
  type Departure,
} from '@vtp/shared-types';
import { Redirect, router } from 'expo-router';
import { ActivityIndicator, RefreshControl, Text } from 'react-native';
import { useT } from '@/i18n/use-t';
import { useSearch } from '@/lib/search-context';
import { useRefreshOnFocus } from '@/lib/use-refresh-on-focus';

export default function Results() {
  const { from, to, date } = useSearch();
  const colors = useColors();
  const { t, locale } = useT();
  const query =
    from && to
      ? `/search/departures?${new URLSearchParams({ from: from.id, to: to.id, date })}`
      : null;
  const departures = useApi<Departure[]>(query, { auth: false });
  useRefreshOnFocus(departures.reload);
  if (!from || !to) return <Redirect href="/" />;

  return (
    <Screen
      refreshControl={
        <RefreshControl
          refreshing={departures.loading}
          onRefresh={() => void departures.reload()}
        />
      }
    >
      <Heading>
        {from.city} → {to.city}
      </Heading>
      <Body muted>
        {longDate(date, locale)} · {t.results.venezuelanTime}
      </Body>
      {departures.error ? (
        <Banner tone="error">
          {departures.error.code === 'VALIDATION_FAILED'
            ? t.results.dateRange
            : departures.error.userMessage}
        </Banner>
      ) : null}
      {departures.loading && !departures.data ? <ActivityIndicator color={colors.text} /> : null}
      {departures.data?.length === 0 ? <Banner tone="info">{t.results.none}</Banner> : null}
      {departures.data?.map((departure) => (
        <DepartureCard
          key={`${departure.scheduleId}:${departure.serviceDate}`}
          departure={departure}
        />
      ))}
    </Screen>
  );
}

function DepartureCard({ departure }: { departure: Departure }) {
  const colors = useColors();
  const { t, shared, locale } = useT();
  const extraDays = daysBetween(departure.departsAt, departure.arrivesAt);
  return (
    <Card>
      <Row>
        <Text style={{ color: colors.text, fontSize: 22, fontWeight: '700' }}>
          {localTime(departure.departsAt)}
        </Text>
        <Body muted>
          → {localTime(departure.arrivesAt)}
          {extraDays ? t.dayOffset(extraDays) : ''} · {formatDuration(departure.durationMinutes)}
        </Body>
      </Row>
      <Text style={{ color: colors.text, fontSize: 16, fontWeight: '600' }}>
        {departure.operator.tradeName ?? departure.operator.legalName}
      </Text>
      <Row>
        <Badge label={shared.serviceClass[departure.serviceClass]} />
        {departure.operator.type === 'taxi_line' ? (
          <Badge label={shared.organizationType.taxi_line} />
        ) : null}
        <Body muted>{t.results.seatsFree(departure.seatsAvailable, departure.seats)}</Body>
      </Row>
      <Body muted>
        {departure.from.name} → {departure.to.name}
      </Body>
      <Text style={{ color: colors.text, fontSize: 18, fontWeight: '700' }}>
        {departure.fare
          ? formatMoney(departure.fare.amount, departure.fare.currency, locale)
          : t.results.priceAtCounter}
      </Text>
      {departure.fare && departure.seatsAvailable > 0 ? (
        <Button
          variant="secondary"
          title={t.results.chooseSeats}
          onPress={() =>
            router.push({
              pathname: '/trip',
              params: { scheduleId: departure.scheduleId, serviceDate: departure.serviceDate },
            })
          }
        />
      ) : null}
    </Card>
  );
}
