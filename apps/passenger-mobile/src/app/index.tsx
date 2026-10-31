import {
  Body,
  Button,
  Card,
  Heading,
  LanguagePicker,
  Screen,
  Segmented,
  Subheading,
  useAuth,
  useColors,
} from '@vtp/mobile-core';
import type { StopSummary } from '@vtp/shared-types';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useT } from '@/i18n/use-t';
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
  const { t } = useT();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${stop ? `${stop.city}, ${stop.name}` : t.home.notChosen}`}
      onPress={onPress}
      style={[styles.stop, { borderColor: colors.border, backgroundColor: colors.card }]}
    >
      <Text style={[styles.stopLabel, { color: colors.muted }]}>{label}</Text>
      <Text style={[styles.stopValue, { color: stop ? colors.text : colors.muted }]}>
        {stop ? stop.city : t.home.pickStop}
      </Text>
      {stop ? <Text style={{ color: colors.muted }}>{stop.name}</Text> : null}
    </Pressable>
  );
}

export default function SearchScreen() {
  const { state } = useAuth();
  const { from, to, date, setDate, swap } = useSearch();
  const { t, locale } = useT();
  const days = upcomingDays(7, undefined, locale, t.home);
  const ready = from && to && from.id !== to.id;

  return (
    <Screen>
      <Heading>{t.home.heading}</Heading>
      <Body muted>{t.home.intro}</Body>
      <Card>
        <StopButton
          label={t.home.origin}
          stop={from}
          onPress={() => router.push({ pathname: '/stop-picker', params: { field: 'from' } })}
        />
        <View style={styles.swap}>
          <Button variant="link" title={t.home.swap} onPress={swap} disabled={!from && !to} />
        </View>
        <StopButton
          label={t.home.destination}
          stop={to}
          onPress={() => router.push({ pathname: '/stop-picker', params: { field: 'to' } })}
        />
        <Segmented
          label={t.home.date}
          options={days}
          value={days.some((d) => d.value === date) ? date : days[0]!.value}
          onChange={setDate}
        />
        {from && to && from.id === to.id ? <Body muted>{t.home.sameStop}</Body> : null}
        <Button title={t.home.search} disabled={!ready} onPress={() => router.push('/results')} />
      </Card>

      <Card>
        <Subheading>{t.home.taxiTitle}</Subheading>
        <Body muted>{t.home.taxiIntro}</Body>
        <Button
          variant="secondary"
          title={t.home.taxiButton}
          onPress={() => router.push(state.status === 'signedIn' ? '/taxi' : '/sign-in')}
        />
      </Card>

      <Subheading>{t.home.accountTitle}</Subheading>
      {state.status === 'signedIn' ? (
        <Button
          variant="secondary"
          title={t.home.myAccount}
          onPress={() => router.push('/account')}
        />
      ) : (
        <>
          <Body muted>{t.home.signInPrompt}</Body>
          <Button
            variant="secondary"
            title={t.home.signIn}
            onPress={() => router.push('/sign-in')}
          />
        </>
      )}
      <LanguagePicker />
    </Screen>
  );
}

const styles = StyleSheet.create({
  stop: { borderWidth: 1, borderRadius: 10, padding: 12, gap: 2 },
  stopLabel: { fontSize: 12, fontWeight: '600', textTransform: 'uppercase' },
  stopValue: { fontSize: 18, fontWeight: '600' },
  swap: { alignItems: 'center', marginVertical: -6 },
});
