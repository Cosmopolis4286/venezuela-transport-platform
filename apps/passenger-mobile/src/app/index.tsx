import {
  Banner,
  Body,
  Button,
  Card,
  Heading,
  LanguagePicker,
  Screen,
  Segmented,
  Subheading,
  TermsPrompt,
  useAuth,
  useColors,
} from '@vtp/mobile-core';
import type { StopSummary } from '@vtp/shared-types';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useT } from '@/i18n/use-t';
import { upcomingDays } from '@/lib/dates';
import { useSearch } from '@/lib/search-context';
import { useRefreshOnFocus } from '@/lib/use-refresh-on-focus';

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
  const {
    from,
    to,
    date,
    setDate,
    swap,
    service,
    openServices,
    setService,
    areas,
    reloadServices,
  } = useSearch();
  const { t, shared, locale } = useT();
  useRefreshOnFocus(reloadServices);
  const days = upcomingDays(7, undefined, locale, t.home);
  const ready = from && to && from.id !== to.id;
  const suburban = service === 'suburban';

  return (
    <Screen>
      {/* Two services on sale: one choice at the top (ADR-029); with one, the screen as always. */}
      {openServices.length > 1 ? (
        <Segmented
          label={t.home.services}
          options={openServices.map((value) => ({ value, label: shared.service[value] }))}
          value={service}
          onChange={setService}
        />
      ) : null}
      <Heading>{suburban ? t.home.suburbanHeading : t.home.heading}</Heading>
      <Body muted>
        {suburban
          ? areas.length <= 2
            ? t.home.suburbanIntro(areas.map((a) => a.name).join(', '))
            : t.home.suburbanIntroGeneric
          : t.home.intro}
      </Body>
      {state.status === 'signedOut' && state.notice ? (
        <Banner tone="info">{state.notice}</Banner>
      ) : null}
      <TermsPrompt />
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

      {/* Trip packs belong to the suburban service (ADR-028). */}
      {suburban ? (
        <Card>
          <Subheading>{t.packs.homeTitle}</Subheading>
          <Body muted>{t.packs.homeIntro}</Body>
          <Button
            variant="secondary"
            title={t.packs.homeButton}
            onPress={() => router.push(state.status === 'signedIn' ? '/trip-packs' : '/sign-in')}
          />
        </Card>
      ) : null}
      {/* Terminal taxis belong to the intercity service. */}
      {suburban || !openServices.includes('intercity') ? null : (
        <Card>
          <Subheading>{t.home.taxiTitle}</Subheading>
          <Body muted>{t.home.taxiIntro}</Body>
          <Button
            variant="secondary"
            title={t.home.taxiButton}
            onPress={() => router.push(state.status === 'signedIn' ? '/taxi' : '/sign-in')}
          />
        </Card>
      )}

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
