import {
  Banner,
  Body,
  Button,
  Card,
  Heading,
  Subheading,
  useApi,
  useAuth,
  useColors,
  userMessage,
} from '@vtp/mobile-core';
import {
  formatPaymentAmount,
  PAYMENT_METHOD_LABELS,
  type Booking,
  type Payment,
  type PaymentMethod,
  type PaymentOption,
} from '@vtp/shared-types';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';

const CURRENCY_NAMES: Record<Payment['currency'], string> = {
  VES: 'Bs.',
  BRL: 'R$',
  USDT: 'USDT',
};

/** While a payment is pending, the booking is reloaded this often to pick up the confirmation. */
const POLL_MS = 5000;

/**
 * Paying a held booking: choose a method (amounts already converted with the operator's rate),
 * then follow the instructions. Confirmation is automatic; the screen polls for it.
 */
export function PaymentPanel({
  booking,
  onBooking,
  reload,
}: {
  booking: Booking;
  onBooking: (booking: Booking) => void;
  reload: () => Promise<void>;
}) {
  const { api } = useAuth();
  const pending = booking.payment?.status === 'pending' ? booking.payment : null;
  const [choosing, setChoosing] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const showOptions = !pending || choosing;
  const options = useApi<PaymentOption[]>(
    showOptions ? `/me/bookings/${booking.id}/payment-options` : null,
  );

  useEffect(() => {
    if (!pending) return;
    const timer = setInterval(() => void reload(), POLL_MS);
    return () => clearInterval(timer);
  }, [pending, reload]);

  const run = async (key: string, action: () => Promise<void>) => {
    setBusy(key);
    setError(null);
    try {
      await action();
    } catch (e) {
      setError(userMessage(e));
    } finally {
      setBusy(null);
    }
  };

  const choose = (method: PaymentMethod) =>
    run(method, async () => {
      await api.request<Payment>(`/me/bookings/${booking.id}/payments`, {
        method: 'POST',
        body: { method },
      });
      setChoosing(false);
      await reload();
    });

  const simulate = (payment: Payment) =>
    run('simulate', async () => {
      onBooking(
        await api.request<Booking>(`/me/payments/${payment.id}/simulate`, { method: 'POST' }),
      );
    });

  return (
    <View style={{ gap: 12 }}>
      {booking.payment?.status === 'refund_due' ? (
        <Banner tone="warning">
          Recibimos un pago que no coincide con el monto o la moneda indicados. Te lo devolveremos;
          puedes pagar de nuevo.
        </Banner>
      ) : null}
      {pending && !choosing ? (
        <PaymentInstructions payment={pending} fareCurrency={booking.total.currency} />
      ) : null}
      {error ? <Banner tone="error">{error}</Banner> : null}
      {pending && !choosing ? (
        <>
          <Button
            title="Ya pagué, comprobar"
            variant="secondary"
            loading={busy === 'check'}
            onPress={() => void run('check', reload)}
          />
          {pending.simulated ? (
            <Button
              title="Simular pago (solo pruebas)"
              loading={busy === 'simulate'}
              onPress={() => void simulate(pending)}
            />
          ) : null}
          <Button title="Pagar con otro método" variant="link" onPress={() => setChoosing(true)} />
        </>
      ) : (
        <PaymentOptions
          options={options.data}
          loadingError={options.error?.userMessage}
          busy={busy}
          onChoose={(method) => void choose(method)}
          onCancel={pending ? () => setChoosing(false) : undefined}
        />
      )}
    </View>
  );
}

function PaymentOptions({
  options,
  loadingError,
  busy,
  onChoose,
  onCancel,
}: {
  options: PaymentOption[] | undefined;
  loadingError: string | undefined;
  busy: string | null;
  onChoose: (method: PaymentMethod) => void;
  onCancel?: () => void;
}) {
  const colors = useColors();
  if (loadingError) return <Banner tone="error">{loadingError}</Banner>;
  if (!options) return <ActivityIndicator color={colors.text} />;
  return (
    <>
      <Subheading>¿Cómo quieres pagar?</Subheading>
      {options.length ? null : (
        <Banner tone="info">
          Esta empresa todavía no acepta pagos en línea. Cancela la reserva o intenta más tarde.
        </Banner>
      )}
      {options.map((option) => (
        <Pressable
          key={option.method}
          accessibilityRole="button"
          accessibilityLabel={`Pagar con ${PAYMENT_METHOD_LABELS[option.method]}`}
          disabled={busy !== null}
          onPress={() => onChoose(option.method)}
          style={({ pressed }) => ({
            borderWidth: 1,
            borderColor: colors.border,
            backgroundColor: colors.card,
            borderRadius: 12,
            padding: 14,
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            opacity: busy !== null && busy !== option.method ? 0.5 : pressed ? 0.8 : 1,
          })}
        >
          <Text style={{ color: colors.text, fontSize: 16, fontWeight: '600' }}>
            {PAYMENT_METHOD_LABELS[option.method]}
          </Text>
          {busy === option.method ? (
            <ActivityIndicator color={colors.text} />
          ) : (
            <Text style={{ color: colors.text, fontSize: 16 }}>
              {formatPaymentAmount(option.amount, option.currency)}
            </Text>
          )}
        </Pressable>
      ))}
      {onCancel ? <Button title="Volver" variant="link" onPress={onCancel} /> : null}
    </>
  );
}

function PaymentInstructions({
  payment,
  fareCurrency,
}: {
  payment: Payment;
  fareCurrency: Booking['total']['currency'];
}) {
  const colors = useColors();
  return (
    <Card>
      <Body muted>{PAYMENT_METHOD_LABELS[payment.method]}</Body>
      <Heading>{formatPaymentAmount(payment.amount, payment.currency)}</Heading>
      {payment.rate ? (
        <Body muted>
          Tasa de la empresa: 1 {fareCurrency === 'USD' ? 'US$' : 'Bs.'} ={' '}
          {Number(payment.rate).toLocaleString('es-VE', { maximumFractionDigits: 6 })}{' '}
          {CURRENCY_NAMES[payment.currency]}
        </Body>
      ) : null}
      {payment.instructions.map((line) => (
        <View
          key={line.label}
          style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}
        >
          <Text style={{ color: colors.muted, fontSize: 15 }}>{line.label}</Text>
          <Text
            selectable
            style={{ color: colors.text, fontSize: 15, fontWeight: '600', flexShrink: 1 }}
          >
            {line.value}
          </Text>
        </View>
      ))}
      <Body muted>
        Paga el monto exacto y escribe la referencia {payment.reference}. La confirmación es
        automática.
      </Body>
    </Card>
  );
}
