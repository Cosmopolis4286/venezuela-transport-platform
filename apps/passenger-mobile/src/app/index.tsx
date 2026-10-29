import {
  Body,
  Button,
  Card,
  Heading,
  Screen,
  Segmented,
  Subheading,
  useAuth,
  useColors,
} from '@vtp/mobile-core';
import type { StopSummary } from '@vtp/shared-types';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { upcomingDays } from '@/lib/dates';
import { useSearch } from '@/lib/search-context';

function StopButton({
  label,
  stop,
  onPress,
}: {
  label: string;
  stop: StopSummary | null;
  onPress: () => void;
}) {
  const colors = useColors();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${stop ? `${stop.city}, ${stop.name}` : 'sin elegir'}`}
      onPress={onPress}
      style={[styles.stop, { borderColor: colors.border, backgroundColor: colors.card }]}
    >
      <Text style={[styles.stopLabel, { color: colors.muted }]}>{label}</Text>
      <Text style={[styles.stopValue, { color: stop ? colors.text : colors.muted }]}>
        {stop ? stop.city : 'Elegir terminal o parada'}
      </Text>
      {stop ? <Text style={{ color: colors.muted }}>{stop.name}</Text> : null}
    </Pressable>
  );
}

export default function SearchScreen() {
  const { state } = useAuth();
  const { from, to, date, setDate, swap } = useSearch();
  const days = upcomingDays();
  const ready = from && to && from.id !== to.id;

  return (
    <Screen>
      <Heading>¿A dónde viajas?</Heading>
      <Body muted>Autobuses y por puesto entre terminales de todo el país.</Body>
      <Card>
        <StopButton
          label="Origen"
          stop={from}
          onPress={() => router.push({ pathname: '/stop-picker', params: { field: 'from' } })}
        />
        <View style={styles.swap}>
          <Button variant="link" title="⇅ Intercambiar" onPress={swap} disabled={!from && !to} />
        </View>
        <StopButton
          label="Destino"
          stop={to}
          onPress={() => router.push({ pathname: '/stop-picker', params: { field: 'to' } })}
        />
        <Segmented
          label="Fecha"
          options={days}
          value={days.some((d) => d.value === date) ? date : days[0]!.value}
          onChange={setDate}
        />
        {from && to && from.id === to.id ? (
          <Body muted>Elige un destino distinto del origen.</Body>
        ) : null}
        <Button title="Buscar salidas" disabled={!ready} onPress={() => router.push('/results')} />
      </Card>

      <Card>
        <Subheading>Taxi en el terminal</Subheading>
        <Body muted>Pide un taxi para salir del terminal o para llegar a tiempo a tu autobús.</Body>
        <Button
          variant="secondary"
          title="Pedir un taxi"
          onPress={() => router.push(state.status === 'signedIn' ? '/taxi' : '/sign-in')}
        />
      </Card>

      <Subheading>Tu cuenta</Subheading>
      {state.status === 'signedIn' ? (
        <Button variant="secondary" title="Mi cuenta" onPress={() => router.push('/account')} />
      ) : (
        <>
          <Body muted>Inicia sesión para guardar tus datos. Pronto podrás comprar boletos.</Body>
          <Button
            variant="secondary"
            title="Iniciar sesión"
            onPress={() => router.push('/sign-in')}
          />
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  stop: { borderWidth: 1, borderRadius: 10, padding: 12, gap: 2 },
  stopLabel: { fontSize: 12, fontWeight: '600', textTransform: 'uppercase' },
  stopValue: { fontSize: 18, fontWeight: '600' },
  swap: { alignItems: 'center', marginVertical: -6 },
});
