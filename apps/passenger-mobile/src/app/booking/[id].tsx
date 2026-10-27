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
  useColors,
  userMessage,
} from '@vtp/mobile-core';
import {
  BOOKING_STATUS_LABELS,
  daysBetween,
  formatMoney,
  localTime,
  longDate,
  SERVICE_CLASS_LABELS,
  type Booking,
} from '@vtp/shared-types';
import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Text } from 'react-native';
import { BOOKING_TONE } from '@/lib/booking-labels';
import { formatClock, useSecondsLeft } from '@/lib/use-countdown';

export default function BookingScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { api } = useAuth();
  const colors = useColors();
  const booking = useApi<Booking>(id ? `/me/bookings/${id}` : null);
  const secondsLeft = useSecondsLeft(booking.data?.expiresAt ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!booking.data) {
    return (
      <Screen>
        {booking.error ? (
          <Banner tone="error">{booking.error.userMessage}</Banner>
        ) : (
          <ActivityIndicator color={colors.text} />
        )}
      </Screen>
    );
  }
  const data = booking.data;
  // The server releases the seats when the hold runs out; reflect it without waiting for a reload.
  const status = data.status === 'held' && secondsLeft === 0 ? 'expired' : data.status;
  const extraDays = daysBetween(data.trip.departsAt, data.trip.arrivesAt);

  const cancel = async () => {
    setBusy(true);
    setError(null);
    try {
      booking.mutate(
        await api.request<Booking>(`/me/bookings/${data.id}/cancel`, { method: 'POST' }),
      );
    } catch (e) {
      setError(userMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <Body muted>Código de reserva</Body>
      <Text
        accessibilityLabel={`Código ${data.code}`}
        style={{ color: colors.text, fontSize: 30, fontWeight: '800', letterSpacing: 2 }}
      >
        {data.code}
      </Text>
      <Badge label={BOOKING_STATUS_LABELS[status]} tone={BOOKING_TONE[status]} />
      {status === 'held' ? (
        <Banner tone="warning">
          Tus puestos están apartados por {formatClock(secondsLeft)} minutos. El pago en línea (pago
          móvil, transferencia, PIX o USDT) se habilita en la próxima versión.
        </Banner>
      ) : null}
      {status === 'expired' ? (
        <Banner tone="error">El tiempo para pagar terminó y los puestos se liberaron.</Banner>
      ) : null}

      <Card>
        <Heading>
          {data.from.city} → {data.to.city}
        </Heading>
        <Body>
          {longDate(data.trip.departsAt)} · {localTime(data.trip.departsAt)} →{' '}
          {localTime(data.trip.arrivesAt)}
          {extraDays ? ` (+${extraDays} d)` : ''}
        </Body>
        <Body muted>
          {data.operator.tradeName ?? data.operator.legalName} ·{' '}
          {SERVICE_CLASS_LABELS[data.trip.serviceClass]}
        </Body>
        <Body muted>
          {data.from.name} → {data.to.name}
        </Body>
      </Card>

      <Subheading>Pasajeros</Subheading>
      {data.passengers.map((p) => (
        <Row key={p.seatNumber}>
          <Badge label={`Puesto ${p.seatNumber}`} />
          <Body>
            {p.firstName} {p.lastName} · {p.documentType}-{p.documentNumber}
          </Body>
        </Row>
      ))}
      <Body>Total: {formatMoney(data.total.amount, data.total.currency)}</Body>
      {error ? <Banner tone="error">{error}</Banner> : null}
      {status === 'held' ? (
        <Button
          variant="secondary"
          title="Cancelar reserva"
          loading={busy}
          onPress={() => void cancel()}
        />
      ) : null}
    </Screen>
  );
}
