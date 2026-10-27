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
  ORGANIZATION_TYPE_LABELS,
  SERVICE_CLASS_LABELS,
  type Departure,
} from '@vtp/shared-types';
import { Redirect, router } from 'expo-router';
import { ActivityIndicator, RefreshControl, Text } from 'react-native';
import { useSearch } from '@/lib/search-context';
import { useRefreshOnFocus } from '@/lib/use-refresh-on-focus';

export default function Results() {
  const { from, to, date } = useSearch();
  const colors = useColors();
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
      <Body muted>{longDate(date)} · horas de Venezuela</Body>
      {departures.error ? (
        <Banner tone="error">
          {departures.error.code === 'VALIDATION_FAILED'
            ? 'Elige una fecha entre hoy y los próximos 180 días.'
            : departures.error.userMessage}
        </Banner>
      ) : null}
      {departures.loading && !departures.data ? <ActivityIndicator color={colors.text} /> : null}
      {departures.data?.length === 0 ? (
        <Banner tone="info">
          No hay salidas publicadas para ese día. Prueba con otra fecha o una terminal cercana.
        </Banner>
      ) : null}
      {departures.data?.map((departure) => (
        <DepartureCard
          key={`${departure.scheduleId}:${departure.serviceDate}`}
          departure={departure}
        />
      ))}
      {departures.data?.length ? (
        <Body muted>La compra de boletos llegará pronto; por ahora compra en la taquilla.</Body>
      ) : null}
    </Screen>
  );
}

function DepartureCard({ departure }: { departure: Departure }) {
  const colors = useColors();
  const extraDays = daysBetween(departure.departsAt, departure.arrivesAt);
  return (
    <Card>
      <Row>
        <Text style={{ color: colors.text, fontSize: 22, fontWeight: '700' }}>
          {localTime(departure.departsAt)}
        </Text>
        <Body muted>
          → {localTime(departure.arrivesAt)}
          {extraDays ? ` (+${extraDays} d)` : ''} · {formatDuration(departure.durationMinutes)}
        </Body>
      </Row>
      <Text style={{ color: colors.text, fontSize: 16, fontWeight: '600' }}>
        {departure.operator.tradeName ?? departure.operator.legalName}
      </Text>
      <Row>
        <Badge label={SERVICE_CLASS_LABELS[departure.serviceClass]} />
        {departure.operator.type === 'taxi_line' ? (
          <Badge label={ORGANIZATION_TYPE_LABELS.taxi_line} />
        ) : null}
        <Body muted>
          {departure.seatsAvailable} de {departure.seats} libres
        </Body>
      </Row>
      <Body muted>
        {departure.from.name} → {departure.to.name}
      </Body>
      <Text style={{ color: colors.text, fontSize: 18, fontWeight: '700' }}>
        {departure.fare
          ? formatMoney(departure.fare.amount, departure.fare.currency)
          : 'Precio en taquilla'}
      </Text>
      {departure.fare && departure.seatsAvailable > 0 ? (
        <Button
          variant="secondary"
          title="Elegir puestos"
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
