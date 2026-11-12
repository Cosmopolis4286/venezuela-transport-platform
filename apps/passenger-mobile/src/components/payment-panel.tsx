import {
  Banner,
  Body,
  Button,
  Card,
  Field,
  Heading,
  Subheading,
  useApi,
  useAuth,
  useColors,
  userMessage,
} from '@vtp/mobile-core';
import {
  formatPaymentAmount,
  INTL_LOCALES,
  type Booking,
  type Payment,
  type PaymentMethod,
  type PaymentOption,
} from '@vtp/shared-types';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { useT } from '@/i18n/use-t';

const CURRENCY_NAMES: Record<Payment['currency'], string> = {
  VES: 'Bs.',
  BRL: 'R$',
  USDT: 'USDT',
};

/** While a payment is pending, the booking is reloaded this often to pick up the confirmation. */
const POLL_MS = 5000;

/**
 * Paying a held booking: choose a method (amounts already converted with the operator's rate),
 * then follow the instructions. Automatic providers confirm on their own; with manual payments
 * the passenger reports the operation number and staff verify it (ADR-027). The screen polls.
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
  const { t } = useT();
  const pending = booking.payment?.status === 'pending' ? booking.payment : null;
  const reported = booking.payment?.status === 'reported' ? booking.payment : null;
  const rejected = booking.payment?.status === 'rejected' ? booking.payment : null;
  const [choosing, setChoosing] = useState(false);
  const [operation, setOperation] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const showOptions = (!pending && !reported) || choosing;
  const options = useApi<PaymentOption[]>(
    showOptions ? `/me/bookings/${booking.id}/payment-options` : null,
  );

  const waiting = Boolean(pending ?? reported);
  useEffect(() => {
    if (!waiting) return;
    const timer = setInterval(() => void reload(), POLL_MS);
    return () => clearInterval(timer);
  }, [waiting, reload]);

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

  const report = (payment: Payment) =>
    run('report', async () => {
      onBooking(
        await api.request<Booking>(`/me/payments/${payment.id}/report`, {
          method: 'POST',
          body: { operationNumber: operation.trim() },
        }),
      );
      setOperation('');
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
        <Banner tone="warning">{t.payment.mismatch}</Banner>
      ) : null}
      {rejected?.rejectionReason ? (
        <Banner tone="error">{t.payment.rejected(rejected.rejectionReason)}</Banner>
      ) : null}
      {reported ? (
        <>
          <Banner tone="info">{t.payment.reported(reported.payerReference ?? '')}</Banner>
          <PaymentInstructions payment={reported} fareCurrency={booking.total.currency} />
          {error ? <Banner tone="error">{error}</Banner> : null}
          <Button
            title={t.payment.check}
            variant="secondary"
            loading={busy === 'check'}
            onPress={() => void run('check', reload)}
          />
        </>
      ) : null}
      {pending && !choosing ? (
        <PaymentInstructions payment={pending} fareCurrency={booking.total.currency} />
      ) : null}
      {error && !reported ? <Banner tone="error">{error}</Banner> : null}
      {reported ? null : pending && !choosing ? (
        <>
          {pending.manual ? (
            <>
              <Field
                label={t.payment.operation}
                hint={t.payment.operationHint}
                value={operation}
                onChangeText={setOperation}
                autoCapitalize="characters"
                autoCorrect={false}
              />
              <Button
                title={t.payment.reportPaid}
                loading={busy === 'report'}
                disabled={operation.trim().length < 4}
                onPress={() => void report(pending)}
              />
            </>
          ) : (
            <Button
              title={t.payment.check}
              variant="secondary"
              loading={busy === 'check'}
              onPress={() => void run('check', reload)}
            />
          )}
          {pending.simulated ? (
            <Button
              title={t.payment.simulate}
              loading={busy === 'simulate'}
              onPress={() => void simulate(pending)}
            />
          ) : null}
          <Button title={t.payment.otherMethod} variant="link" onPress={() => setChoosing(true)} />
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
  const { t, shared, locale } = useT();
  if (loadingError) return <Banner tone="error">{loadingError}</Banner>;
  if (!options) return <ActivityIndicator color={colors.text} />;
  return (
    <>
      <Subheading>{t.payment.howToPay}</Subheading>
      {options.length ? null : <Banner tone="info">{t.payment.noOnline}</Banner>}
      {options.map((option) => (
        <Pressable
          key={option.method}
          accessibilityRole="button"
          accessibilityLabel={t.payment.payWith(shared.paymentMethod[option.method])}
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
            {shared.paymentMethod[option.method]}
          </Text>
          {busy === option.method ? (
            <ActivityIndicator color={colors.text} />
          ) : (
            <Text style={{ color: colors.text, fontSize: 16 }}>
              {formatPaymentAmount(option.amount, option.currency, locale)}
            </Text>
          )}
        </Pressable>
      ))}
      {onCancel ? <Button title={t.payment.back} variant="link" onPress={onCancel} /> : null}
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
  const { t, shared, locale } = useT();
  return (
    <Card>
      <Body muted>{shared.paymentMethod[payment.method]}</Body>
      <Heading>{formatPaymentAmount(payment.amount, payment.currency, locale)}</Heading>
      {payment.rate ? (
        <Body muted>
          {t.payment.rate(
            fareCurrency === 'USD' ? 'US$' : 'Bs.',
            Number(payment.rate).toLocaleString(INTL_LOCALES[locale], {
              maximumFractionDigits: 6,
            }),
            CURRENCY_NAMES[payment.currency],
          )}
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
      {payment.status === 'pending' ? (
        <Body muted>
          {payment.manual
            ? t.payment.exactManual(payment.reference)
            : t.payment.exact(payment.reference)}
        </Body>
      ) : null}
    </Card>
  );
}
