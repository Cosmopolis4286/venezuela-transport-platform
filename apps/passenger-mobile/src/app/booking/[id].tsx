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
  formatPaymentAmount,
  localTime,
  longDate,
  PAYMENT_METHOD_LABELS,
  SERVICE_CLASS_LABELS,
  type Booking,
} from '@vtp/shared-types';
import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { PaymentPanel } from '@/components/payment-panel';
import { QrCode } from '@/components/qr-code';
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
  const refundDue = data.payment?.status === 'refund_due' && status !== 'held';
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
          Tus puestos están apartados por {formatClock(secondsLeft)} minutos. Paga antes de que
          termine el tiempo.
        </Banner>
      ) : null}
      {status === 'confirmed' ? (
        <Banner tone="success">
          Pago confirmado. Muestra el código QR de cada pasajero al abordar.
        </Banner>
      ) : null}
      {status === 'expired' ? (
        <Banner tone="error">El tiempo para pagar terminó y los puestos se liberaron.</Banner>
      ) : null}
      {refundDue ? (
        <Banner tone="warning">
          Tu pago llegó cuando la reserva ya no estaba activa. Te lo devolveremos.
        </Banner>
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

      {status === 'held' ? (
        <PaymentPanel booking={data} onBooking={booking.mutate} reload={booking.reload} />
      ) : null}

      <Subheading>{status === 'confirmed' ? 'Boletos' : 'Pasajeros'}</Subheading>
      {data.passengers.map((p) =>
        p.ticket ? (
          <Card key={p.seatNumber}>
            <Row>
              <Badge label={`Puesto ${p.seatNumber}`} />
              {p.ticket.boardedAt ? <Badge label="Abordó" tone="success" /> : null}
            </Row>
            <Heading>
              {p.firstName} {p.lastName}
            </Heading>
            <Body muted>
              {p.documentType}-{p.documentNumber}
            </Body>
            <View style={{ paddingVertical: 8 }}>
              <QrCode value={p.ticket.qr} />
            </View>
          </Card>
        ) : (
          <Row key={p.seatNumber}>
            <Badge label={`Puesto ${p.seatNumber}`} />
            <Body>
              {p.firstName} {p.lastName} · {p.documentType}-{p.documentNumber}
            </Body>
          </Row>
        ),
      )}
      <Body>Total: {formatMoney(data.total.amount, data.total.currency)}</Body>
      {data.payment?.status === 'confirmed' ? (
        <Body muted>
          Pagado con {PAYMENT_METHOD_LABELS[data.payment.method]}:{' '}
          {formatPaymentAmount(data.payment.amount, data.payment.currency)} · ref.{' '}
          {data.payment.reference}
        </Body>
      ) : null}
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
