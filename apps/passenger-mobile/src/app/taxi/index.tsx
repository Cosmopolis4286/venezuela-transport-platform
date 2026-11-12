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
  useColors,
  userMessage,
} from '@vtp/mobile-core';
import {
  TAXI_DIRECTIONS,
  type TaxiDirection,
  type TaxiRide,
  type TaxiTerminal,
} from '@vtp/shared-types';
import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, Text } from 'react-native';
import { useT } from '@/i18n/use-t';
import { isOpenRide } from '@/lib/taxi';
import { useRefreshOnFocus } from '@/lib/use-refresh-on-focus';

const PASSENGERS = (['1', '2', '3', '4'] as const).map((value) => ({ value, label: value }));

/** Ask for a taxi to or from a terminal; the taxi lines there take it. */
export default function RequestTaxiScreen() {
  const { api } = useAuth();
  const colors = useColors();
  const { t, shared } = useT();
  const directions = TAXI_DIRECTIONS.map((value) => ({
    value,
    label: shared.taxiDirection[value],
  }));
  const terminals = useApi<TaxiTerminal[]>('/taxi/terminals', { auth: false });
  const rides = useApi<TaxiRide[]>('/me/taxi-rides');
  useRefreshOnFocus(rides.reload);
  const [terminalId, setTerminalId] = useState<string | null>(null);
  const [direction, setDirection] = useState<TaxiDirection>('from_terminal');
  const [address, setAddress] = useState('');
  const [notes, setNotes] = useState('');
  const [passengers, setPassengers] = useState<(typeof PASSENGERS)[number]['value']>('1');
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const open = rides.data?.find(isOpenRide);
  const ready = terminalId !== null && address.trim().length >= 5 && !busy;

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const ride = await api.request<TaxiRide>('/me/taxi-rides', {
        method: 'POST',
        body: {
          terminalStopId: terminalId,
          direction,
          address: address.trim(),
          notes: notes.trim() || undefined,
          passengers: Number(passengers),
          contactPhone: phone.trim() || undefined,
        },
      });
      router.replace({ pathname: '/taxi/[id]', params: { id: ride.id } });
    } catch (e) {
      setError(userMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <Heading>{t.taxi.heading}</Heading>
      <Body muted>{t.taxi.intro}</Body>

      {open ? (
        <Card>
          <Body>{t.taxi.alreadyHave(shared.taxiRideStatus[open.status])}</Body>
          <Button
            title={t.taxi.viewMine}
            onPress={() => router.push({ pathname: '/taxi/[id]', params: { id: open.id } })}
          />
        </Card>
      ) : (
        <>
          <Subheading>{t.taxi.terminal}</Subheading>
          {terminals.error ? <Banner tone="error">{terminals.error.userMessage}</Banner> : null}
          {terminals.loading && !terminals.data ? <ActivityIndicator color={colors.text} /> : null}
          {terminals.data?.length === 0 ? <Body muted>{t.taxi.noneYet}</Body> : null}
          {terminals.data?.map((terminal) => {
            const selected = terminal.id === terminalId;
            return (
              <Pressable
                key={terminal.id}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                accessibilityLabel={`${terminal.name}, ${terminal.city}`}
                onPress={() => setTerminalId(terminal.id)}
                style={{
                  borderWidth: 2,
                  borderRadius: 12,
                  borderColor: selected ? colors.primary : 'transparent',
                }}
              >
                <Card>
                  <Text style={{ color: colors.text, fontSize: 16, fontWeight: '600' }}>
                    {terminal.name}
                  </Text>
                  <Body muted>
                    {terminal.city} · {t.taxi.lines(terminal.lines)}
                  </Body>
                </Card>
              </Pressable>
            );
          })}

          <Card>
            <Segmented
              label={t.taxi.trip}
              options={directions}
              value={direction}
              onChange={setDirection}
            />
            <Field
              label={direction === 'from_terminal' ? t.taxi.whereTo : t.taxi.whereFrom}
              placeholder={t.taxi.addressPlaceholder}
              value={address}
              onChangeText={setAddress}
              maxLength={200}
            />
            <Segmented
              label={t.taxi.passengers}
              options={PASSENGERS}
              value={passengers}
              onChange={setPassengers}
            />
            <Field
              label={t.taxi.notes}
              placeholder={t.taxi.notesPlaceholder}
              value={notes}
              onChangeText={setNotes}
              maxLength={200}
            />
            <Field
              label={t.taxi.phone}
              hint={t.taxi.phoneHint}
              placeholder="0414-1234567"
              keyboardType="phone-pad"
              value={phone}
              onChangeText={setPhone}
            />
            {error ? <Banner tone="error">{error}</Banner> : null}
            <Button
              title={t.taxi.request}
              loading={busy}
              disabled={!ready}
              onPress={() => void submit()}
            />
          </Card>
        </>
      )}

      {rides.data?.some((r) => !isOpenRide(r)) ? (
        <>
          <Subheading>{t.taxi.previous}</Subheading>
          {rides.data
            .filter((r) => !isOpenRide(r))
            .slice(0, 5)
            .map((ride) => (
              <Pressable
                key={ride.id}
                accessibilityRole="button"
                onPress={() => router.push({ pathname: '/taxi/[id]', params: { id: ride.id } })}
              >
                <Card>
                  <Body>
                    {shared.taxiDirection[ride.direction]} · {ride.terminal.name}
                  </Body>
                  <Body muted>
                    {ride.address} · {shared.taxiRideStatus[ride.status]}
                  </Body>
                </Card>
              </Pressable>
            ))}
        </>
      ) : null}
    </Screen>
  );
}
