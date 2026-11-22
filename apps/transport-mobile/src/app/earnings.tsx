import {
  Banner,
  Body,
  Button,
  Card,
  Field,
  Heading,
  Screen,
  Segmented,
  Subheading,
  useApi,
  useAuth,
  userMessage,
} from '@vtp/mobile-core';
import {
  DRIVER_DEBT_LIMIT,
  DRIVER_PAYOUT_MINIMUM,
  formatPaymentAmount,
  PAYMENT_ACCOUNT_FIELDS,
  PAYMENT_METHOD_LABELS,
  PAYOUT_METHOD_LABELS,
  PAYOUT_METHODS,
  type DriverDebt,
  type DriverEarnings,
  type PaymentMethod,
  type DriverPayoutAccount,
  type PayoutMethod,
} from '@vtp/shared-types';
import { useState } from 'react';
import { RefreshControl } from 'react-native';
import { useRefreshOnFocus } from '@/lib/use-refresh-on-focus';

/**
 * Paying a commission debt (ADR-046): the platform's accounts for its currency, and the form to
 * report the transfer. Finance confirms it; until then it shows as being checked.
 */
function PayDebt({ debt, onReported }: { debt: DriverDebt; onReported: () => void }) {
  const { api } = useAuth();
  const [method, setMethod] = useState<PaymentMethod | null>(debt.accounts[0]?.method ?? null);
  const [amount, setAmount] = useState(debt.amount);
  const [reference, setReference] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const account = debt.accounts.find((a) => a.method === method);
  const waiting = debt.report?.status === 'reported';

  const send = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.request('/me/debt-payments', {
        method: 'POST',
        body: {
          organizationId: debt.organization.id,
          currency: debt.currency,
          amount: amount.replace(',', '.'),
          method,
          reference: reference.trim(),
        },
      });
      setReference('');
      onReported();
    } catch (e) {
      setError(userMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <Subheading>Pagar mi deuda con {debt.organization.name}</Subheading>
      <Body>Debes {formatPaymentAmount(debt.amount, debt.currency)} de comisiones.</Body>
      {waiting ? (
        <Banner tone="info">
          Reportaste {formatPaymentAmount(debt.report!.amount, debt.currency)} (operación{' '}
          {debt.report!.reference}). Lo estamos verificando: te avisamos al confirmarlo.
        </Banner>
      ) : (
        <>
          {debt.report?.status === 'rejected' ? (
            <Banner tone="error">
              No confirmamos tu pago anterior: {debt.report.rejectionReason}
            </Banner>
          ) : null}
          {debt.accounts.length === 0 ? (
            <Body muted>
              Todavía no hay una cuenta de VTP para pagar en esta moneda: escríbenos para pagarla.
            </Body>
          ) : (
            <>
              <Segmented
                label="Paga por"
                options={debt.accounts.map((a) => ({
                  value: a.method,
                  label: PAYMENT_METHOD_LABELS[a.method],
                }))}
                value={method ?? debt.accounts[0]!.method}
                onChange={setMethod}
              />
              {account
                ? PAYMENT_ACCOUNT_FIELDS[account.method].map((field) => (
                    <Body key={field.key} selectable>
                      {field.label}: {account.fields[field.key]}
                    </Body>
                  ))
                : null}
              <Field
                label="Monto que pagaste"
                value={amount}
                onChangeText={setAmount}
                keyboardType="decimal-pad"
              />
              <Field
                label="Número de operación"
                value={reference}
                onChangeText={setReference}
                autoCapitalize="characters"
                maxLength={100}
              />
              {error ? <Banner tone="error">{error}</Banner> : null}
              <Button
                title="Ya pagué"
                loading={busy}
                disabled={reference.trim().length < 3 || !account}
                onPress={() => void send()}
              />
            </>
          )}
        </>
      )}
    </Card>
  );
}

const EMPTY: DriverPayoutAccount = {
  method: 'pago_movil',
  bank: '',
  account: '',
  holderId: '',
  holderName: '',
};

const ACCOUNT_LABEL: Record<PayoutMethod, string> = {
  pago_movil: 'Teléfono del pago móvil',
  bank_transfer: 'Número de cuenta',
  usdt: 'Dirección de la billetera',
};

/**
 * What the driver earned on routes that pay their drivers (ADR-030), and where the platform pays
 * them. Interurban routes usually pay the line instead; then there is nothing here.
 */
export default function EarningsScreen() {
  const { api } = useAuth();
  const earnings = useApi<DriverEarnings>('/me/earnings');
  const { reload } = earnings;
  useRefreshOnFocus(reload);
  // What the driver is typing; until then, the saved account (or an empty form).
  const [draft, setDraft] = useState<DriverPayoutAccount | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const account = draft ?? earnings.data?.payoutAccount ?? EMPTY;
  const update = (patch: Partial<DriverPayoutAccount>) => setDraft({ ...account, ...patch });
  const complete =
    account.bank.trim().length >= 2 &&
    account.account.trim().length >= 4 &&
    account.holderId.trim().length >= 4 &&
    account.holderName.trim().length >= 2;

  const save = async () => {
    setBusy(true);
    setMessage(null);
    try {
      await api.request('/me/payout-account', { method: 'PUT', body: account });
      setMessage({ tone: 'success', text: 'Guardamos tu cuenta de cobro.' });
      await reload();
      setDraft(null);
    } catch (error) {
      setMessage({ tone: 'error', text: userMessage(error) });
    } finally {
      setBusy(false);
    }
  };

  const debts = useApi<DriverDebt[]>('/me/debts');
  const balances = earnings.data?.balances ?? [];
  const commission = earnings.data?.commission ?? null;
  const pct = (rate: string) => `${Number(rate).toLocaleString('es-VE')} %`;
  return (
    <Screen refreshControl={<RefreshControl refreshing={earnings.loading} onRefresh={reload} />}>
      <Heading>Mis cobros</Heading>
      <Body muted>
        En las rutas que les pagan a sus conductores (por lo general las urbanas y suburbanas), lo
        que pagan los pasajeros de tus viajes es tuyo. La plataforma te lo transfiere a la cuenta
        que indiques abajo.
      </Body>
      {earnings.error ? <Banner tone="error">{userMessage(earnings.error)}</Banner> : null}
      {commission ? (
        // Independent drivers (ADR-045): commission, weekly payouts and the debt limit.
        <Card>
          <Subheading>Conduces con VTP</Subheading>
          <Body>
            Comisión de VTP: {pct(commission.rate)} de cada viaje
            {commission.next
              ? `. Desde el ${new Date(commission.next.from).toLocaleDateString('es-VE')}: ${pct(commission.next.rate)}`
              : ''}
            .
          </Body>
          <Body muted>
            Los viajes que te pagan en efectivo te dejan la comisión como deuda; los pagados con
            paquete te los acreditamos sin ella. Cada lunes te transferimos lo que te debemos (desde{' '}
            {formatPaymentAmount(DRIVER_PAYOUT_MINIMUM.USD, 'USD')} o{' '}
            {formatPaymentAmount(DRIVER_PAYOUT_MINIMUM.VES, 'VES')}). Si debes más de{' '}
            {formatPaymentAmount(DRIVER_DEBT_LIMIT.USD, 'USD')} o{' '}
            {formatPaymentAmount(DRIVER_DEBT_LIMIT.VES, 'VES')}, no puedes conectarte hasta pagarla:
            págala aquí abajo y repórtala.
          </Body>
        </Card>
      ) : null}
      {balances.length === 0 && !earnings.loading ? (
        <Body muted>Todavía no tienes ventas en rutas que paguen al conductor.</Body>
      ) : null}
      {(debts.data ?? []).map((debt) => (
        <PayDebt
          key={`${debt.organization.id}:${debt.currency}`}
          debt={debt}
          onReported={() => {
            void debts.reload();
            void reload();
          }}
        />
      ))}
      {balances.map((b) => (
        <Card key={`${b.organization.id}:${b.currency}`}>
          <Subheading>{b.organization.name}</Subheading>
          {b.balance.startsWith('-') ? (
            <Banner tone="warning">
              Debes {formatPaymentAmount(b.balance.slice(1), b.currency)} de comisiones.
            </Banner>
          ) : (
            <Body>Por cobrar: {formatPaymentAmount(b.balance, b.currency)}</Body>
          )}
          <Body muted>
            Ganado {formatPaymentAmount(b.earned, b.currency)} · ya pagado{' '}
            {formatPaymentAmount(b.paidOut, b.currency)}
            {b.collected !== '0.00'
              ? ` · pagaste de comisiones ${formatPaymentAmount(b.collected, b.currency)}`
              : ''}
          </Body>
          {b.pending !== '0.00' ? (
            <Body muted>
              En camino a tu cuenta: {formatPaymentAmount(b.pending, b.currency)} (pago semanal).
            </Body>
          ) : null}
        </Card>
      ))}

      <Subheading>Dónde te pagamos</Subheading>
      <Segmented
        label="Medio"
        options={PAYOUT_METHODS.map((method) => ({
          value: method,
          label: PAYOUT_METHOD_LABELS[method],
        }))}
        value={account.method}
        onChange={(method) => update({ method })}
      />
      <Field
        label={account.method === 'usdt' ? 'Red' : 'Banco'}
        value={account.bank}
        onChangeText={(bank) => update({ bank })}
        placeholder={account.method === 'usdt' ? 'TRC-20' : '0102 – Banco de Venezuela'}
      />
      <Field
        label={ACCOUNT_LABEL[account.method]}
        value={account.account}
        onChangeText={(value) => update({ account: value })}
        keyboardType={account.method === 'usdt' ? 'default' : 'phone-pad'}
        autoCapitalize="none"
      />
      <Field
        label="Cédula del titular"
        value={account.holderId}
        onChangeText={(holderId) => update({ holderId })}
        placeholder="V-12345678"
        autoCapitalize="characters"
      />
      <Field
        label="Nombre del titular"
        value={account.holderName}
        onChangeText={(holderName) => update({ holderName })}
      />
      {message ? <Banner tone={message.tone}>{message.text}</Banner> : null}
      <Button title="Guardar cuenta" loading={busy} disabled={!complete} onPress={save} />
    </Screen>
  );
}
