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
  daysBetween,
  formatMoney,
  formatPaymentAmount,
  localTime,
  longDate,
  type Booking,
  type CancellationQuote,
  type RefundTier,
} from '@vtp/shared-types';
import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { PaymentPanel } from '@/components/payment-panel';
import { QrCode } from '@/components/qr-code';
import { useT } from '@/i18n/use-t';
import { BOOKING_TONE } from '@/lib/booking-labels';
import { formatClock, useSecondsLeft } from '@/lib/use-countdown';

export default function BookingScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { api } = useAuth();
  const colors = useColors();
  const { t, shared, locale } = useT();
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
  // A cancelled booking whose payment had confirmed it: the passenger cancelled a paid trip.
  const cancelledPaid = status === 'cancelled' && Boolean(data.payment?.confirmedAt);
  const refundDue = data.payment?.status === 'refund_due' && status !== 'held' && !cancelledPaid;
  const refunded = data.payment?.status === 'refunded' && status !== 'held' && !cancelledPaid;
  const refundText = (payment: NonNullable<Booking['payment']>) =>
    formatPaymentAmount(payment.refundAmount ?? payment.amount, payment.currency, locale);
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
      <Body muted>{t.booking.code}</Body>
      <Text
        accessibilityLabel={t.booking.codeA11y(data.code)}
        style={{ color: colors.text, fontSize: 30, fontWeight: '800', letterSpacing: 2 }}
      >
        {data.code}
      </Text>
      <Badge label={shared.bookingStatus[status]} tone={BOOKING_TONE[status]} />
      {status === 'held' ? (
        <Banner tone="warning">{t.booking.held(formatClock(secondsLeft))}</Banner>
      ) : null}
      {status === 'confirmed' ? <Banner tone="success">{t.booking.confirmed}</Banner> : null}
      {status === 'expired' ? <Banner tone="error">{t.booking.expired}</Banner> : null}
      {refundDue ? <Banner tone="warning">{t.booking.refundDue}</Banner> : null}
      {refunded ? <Banner tone="info">{t.booking.refunded}</Banner> : null}
      {cancelledPaid && data.payment ? (
        <Banner tone="info">
          {data.payment.status === 'refund_due'
            ? t.booking.cancelledRefund(refundText(data.payment))
            : data.payment.status === 'refunded'
              ? t.booking.cancelledRefunded(refundText(data.payment))
              : t.booking.cancelledNoRefund}
        </Banner>
      ) : null}

      <Card>
        <Heading>
          {data.from.city} → {data.to.city}
        </Heading>
        <Body>
          {longDate(data.trip.departsAt, locale)} · {localTime(data.trip.departsAt)} →{' '}
          {localTime(data.trip.arrivesAt)}
          {extraDays ? t.dayOffset(extraDays) : ''}
        </Body>
        <Body muted>
          {data.operator.tradeName ?? data.operator.legalName} ·{' '}
          {shared.serviceClass[data.trip.serviceClass]}
        </Body>
        <Body muted>
          {data.from.name} → {data.to.name}
        </Body>
      </Card>

      {status === 'held' || status === 'confirmed' ? (
        <Body muted>
          {t.booking.policy}: {policyText(t, data.refundPolicy)}
        </Body>
      ) : null}

      {status === 'held' ? (
        <PaymentPanel booking={data} onBooking={booking.mutate} reload={booking.reload} />
      ) : null}

      <Subheading>{status === 'confirmed' ? t.booking.tickets : t.booking.passengers}</Subheading>
      {data.passengers.map((p) =>
        p.ticket ? (
          <Card key={p.seatNumber}>
            <Row>
              <Badge label={t.seat(p.seatNumber)} />
              {p.ticket.boardedAt ? <Badge label={t.booking.boarded} tone="success" /> : null}
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
            <Badge label={t.seat(p.seatNumber)} />
            <Body>
              {p.firstName} {p.lastName} · {p.documentType}-{p.documentNumber}
            </Body>
          </Row>
        ),
      )}
      <Body>
        {t.booking.total}: {formatMoney(data.total.amount, data.total.currency, locale)}
      </Body>
      {data.payment?.status === 'confirmed' ? (
        <Body muted>
          {t.booking.paidWith(
            shared.paymentMethod[data.payment.method],
            formatPaymentAmount(data.payment.amount, data.payment.currency, locale),
            data.payment.reference,
          )}
        </Body>
      ) : null}
      {error ? <Banner tone="error">{error}</Banner> : null}
      {status === 'held' ? (
        <Button
          variant="secondary"
          title={t.booking.cancel}
          loading={busy}
          onPress={() => void cancel()}
        />
      ) : null}
      {status === 'confirmed' ? (
        <CancelPaid bookingId={data.id} onCancelled={(b) => booking.mutate(b)} />
      ) : null}
    </Screen>
  );
}

/** "100 % up to 48 h before · 50 % up to 2 h before · after that, no refund". */
function policyText(t: ReturnType<typeof useT>['t'], tiers: readonly RefundTier[]): string {
  return [
    ...tiers.map((tier) => t.booking.tier(tier.percent, tier.hoursBefore)),
    t.booking.tierAfter,
  ].join(' · ');
}

/** Cancels a paid trip after showing what would be refunded now, per the operator's policy. */
function CancelPaid({
  bookingId,
  onCancelled,
}: {
  bookingId: string;
  onCancelled: (booking: Booking) => void;
}) {
  const { api } = useAuth();
  const { t, locale } = useT();
  const [quote, setQuote] = useState<CancellationQuote | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (e) {
      setError(userMessage(e));
    } finally {
      setBusy(false);
    }
  };
  const ask = () =>
    run(async () => {
      setQuote(await api.request<CancellationQuote>(`/me/bookings/${bookingId}/cancellation`));
    });
  const confirm = () =>
    run(async () => {
      onCancelled(
        await api.request<Booking>(`/me/bookings/${bookingId}/cancel`, { method: 'POST' }),
      );
      setQuote(null);
    });

  if (!quote) {
    return (
      <View style={{ gap: 12 }}>
        {error ? <Banner tone="error">{error}</Banner> : null}
        <Button
          variant="secondary"
          title={t.booking.cancelPaid}
          loading={busy}
          onPress={() => void ask()}
        />
      </View>
    );
  }
  return (
    <Card>
      <Subheading>{t.booking.cancelPaid}</Subheading>
      {!quote.cancellable ? (
        <Body>{t.booking.notCancellable}</Body>
      ) : quote.refund ? (
        <Body>
          {t.booking.cancelQuote(
            formatPaymentAmount(quote.refund.amount, quote.refund.currency, locale),
            quote.refundPercent,
          )}
        </Body>
      ) : (
        <Body>{t.booking.cancelNoRefund}</Body>
      )}
      <Body muted>
        {t.booking.policy}: {policyText(t, quote.policy)}
      </Body>
      {error ? <Banner tone="error">{error}</Banner> : null}
      {quote.cancellable ? (
        <Button title={t.booking.cancelConfirm} loading={busy} onPress={() => void confirm()} />
      ) : null}
      <Button variant="secondary" title={t.booking.cancelKeep} onPress={() => setQuote(null)} />
    </Card>
  );
}
