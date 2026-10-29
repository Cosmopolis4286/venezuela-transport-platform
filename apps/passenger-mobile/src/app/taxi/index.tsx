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
  TAXI_DIRECTION_LABELS,
  TAXI_RIDE_STATUS_LABELS,
  type TaxiDirection,
  type TaxiRide,
  type TaxiTerminal,
} from '@vtp/shared-types';
import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, Text } from 'react-native';
import { isOpenRide } from '@/lib/taxi';
import { useRefreshOnFocus } from '@/lib/use-refresh-on-focus';

const DIRECTIONS = (['from_terminal', 'to_terminal'] as const).map((value) => ({
  value,
  label: TAXI_DIRECTION_LABELS[value],
}));
const PASSENGERS = (['1', '2', '3', '4'] as const).map((value) => ({ value, label: value }));

/** Ask for a taxi to or from a terminal; the taxi lines there take it. */
export default function RequestTaxiScreen() {
  const { api } = useAuth();
  const colors = useColors();
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
      <Heading>Taxi desde o hacia el terminal</Heading>
      <Body muted>
        Las líneas de taxi del terminal ven tu solicitud; la primera que la toma te dice la tarifa.
        Pagas al conductor.
      </Body>

      {open ? (
        <Card>
          <Body>Ya tienes un taxi: {TAXI_RIDE_STATUS_LABELS[open.status].toLowerCase()}.</Body>
          <Button
            title="Ver mi taxi"
            onPress={() => router.push({ pathname: '/taxi/[id]', params: { id: open.id } })}
          />
        </Card>
      ) : (
        <>
          <Subheading>Terminal</Subheading>
          {terminals.error ? <Banner tone="error">{terminals.error.userMessage}</Banner> : null}
          {terminals.loading && !terminals.data ? <ActivityIndicator color={colors.text} /> : null}
          {terminals.data?.length === 0 ? (
            <Body muted>Todavía ninguna línea de taxi ofrece este servicio.</Body>
          ) : null}
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
                    {terminal.city} · {terminal.lines}{' '}
                    {terminal.lines === 1 ? 'línea de taxi' : 'líneas de taxi'}
                  </Body>
                </Card>
              </Pressable>
            );
          })}

          <Card>
            <Segmented
              label="Viaje"
              options={DIRECTIONS}
              value={direction}
              onChange={setDirection}
            />
            <Field
              label={direction === 'from_terminal' ? '¿A dónde vas?' : '¿Dónde te buscamos?'}
              placeholder="Calle, sector y un punto de referencia"
              value={address}
              onChangeText={setAddress}
              maxLength={200}
            />
            <Segmented
              label="Pasajeros"
              options={PASSENGERS}
              value={passengers}
              onChange={setPassengers}
            />
            <Field
              label="Notas (opcional)"
              placeholder="Equipaje, mascotas, silla de ruedas…"
              value={notes}
              onChangeText={setNotes}
              maxLength={200}
            />
            <Field
              label="Teléfono de contacto (opcional)"
              hint="Solo lo ve el conductor que tome tu viaje. Si no lo escribes, usamos el de tu cuenta."
              placeholder="0414-1234567"
              keyboardType="phone-pad"
              value={phone}
              onChangeText={setPhone}
            />
            {error ? <Banner tone="error">{error}</Banner> : null}
            <Button
              title="Pedir taxi"
              loading={busy}
              disabled={!ready}
              onPress={() => void submit()}
            />
          </Card>
        </>
      )}

      {rides.data?.some((r) => !isOpenRide(r)) ? (
        <>
          <Subheading>Taxis anteriores</Subheading>
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
                    {TAXI_DIRECTION_LABELS[ride.direction]} · {ride.terminal.name}
                  </Body>
                  <Body muted>
                    {ride.address} · {TAXI_RIDE_STATUS_LABELS[ride.status]}
                  </Body>
                </Card>
              </Pressable>
            ))}
        </>
      ) : null}
    </Screen>
  );
}
