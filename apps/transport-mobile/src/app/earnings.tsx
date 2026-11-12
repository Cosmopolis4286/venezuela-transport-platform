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
  formatPaymentAmount,
  PAYOUT_METHOD_LABELS,
  PAYOUT_METHODS,
  type DriverEarnings,
  type DriverPayoutAccount,
  type PayoutMethod,
} from '@vtp/shared-types';
import { useState } from 'react';
import { RefreshControl } from 'react-native';
import { useRefreshOnFocus } from '@/lib/use-refresh-on-focus';

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

  const balances = earnings.data?.balances ?? [];
  return (
    <Screen refreshControl={<RefreshControl refreshing={earnings.loading} onRefresh={reload} />}>
      <Heading>Mis cobros</Heading>
      <Body muted>
        En las rutas que les pagan a sus conductores (por lo general las urbanas y suburbanas), lo
        que pagan los pasajeros de tus viajes es tuyo. La plataforma te lo transfiere a la cuenta
        que indiques abajo.
      </Body>
      {earnings.error ? <Banner tone="error">{userMessage(earnings.error)}</Banner> : null}
      {balances.length === 0 && !earnings.loading ? (
        <Body muted>Todavía no tienes ventas en rutas que paguen al conductor.</Body>
      ) : null}
      {balances.map((b) => (
        <Card key={`${b.organization.id}:${b.currency}`}>
          <Subheading>{b.organization.name}</Subheading>
          <Body>Por cobrar: {formatPaymentAmount(b.balance, b.currency)}</Body>
          <Body muted>
            Ganado {formatPaymentAmount(b.earned, b.currency)} · ya pagado{' '}
            {formatPaymentAmount(b.paidOut, b.currency)}
          </Body>
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
