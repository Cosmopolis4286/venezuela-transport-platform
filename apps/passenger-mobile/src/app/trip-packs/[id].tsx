import {
  Badge,
  Banner,
  Body,
  Card,
  Heading,
  Row,
  Screen,
  useApi,
  useColors,
} from '@vtp/mobile-core';
import {
  formatMoney,
  longDate,
  networkClock,
  toNetworkIso,
  type TripPack,
} from '@vtp/shared-types';
import { useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, RefreshControl, Text } from 'react-native';
import { PaymentPanel } from '@/components/payment-panel';
import { useT } from '@/i18n/use-t';
import { PACK_TONE } from '@/lib/trip-packs';

/** One trip pack: its terms, the trips left, and paying it while it waits for the money. */
export default function TripPackScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const colors = useColors();
  const { t, shared, locale } = useT();
  const pack = useApi<TripPack>(`/me/trip-packs/${id}`);
  const data = pack.data;
  if (!data) {
    return (
      <Screen>
        {pack.error ? (
          <Banner tone="error">{pack.error.userMessage}</Banner>
        ) : (
          <ActivityIndicator color={colors.text} />
        )}
      </Screen>
    );
  }
  const dateTime = (iso: string) => `${longDate(toNetworkIso(iso), locale)}, ${networkClock(iso)}`;
  return (
    <Screen
      refreshControl={
        <RefreshControl refreshing={pack.loading} onRefresh={() => void pack.reload()} />
      }
    >
      <Row>
        <Heading>{t.packs.product(data.trips, data.stops[0].city, data.stops[1].city)}</Heading>
      </Row>
      <Row>
        <Badge label={t.packs.status[data.status]} tone={PACK_TONE[data.status]} />
        <Badge label={shared.transportMode[data.mode]} />
      </Row>
      <Card>
        <Body>
          {data.stops[0].name} ↔ {data.stops[1].name}
        </Body>
        <Text style={{ color: colors.text, fontSize: 18, fontWeight: '700' }}>
          {formatMoney(data.price, data.currency, locale)}
        </Text>
        <Body muted>
          {t.packs.perTrip(formatMoney(data.unitPrice, data.currency, locale))} · {data.code}
        </Body>
        {data.status === 'active' ? (
          <Body>{t.packs.remaining(data.remaining, data.trips)}</Body>
        ) : null}
        {data.expiresAt ? (
          <Body muted>{t.packs.expires(longDate(toNetworkIso(data.expiresAt), locale))}</Body>
        ) : (
          <Body muted>{t.packs.validity(data.validityDays)}</Body>
        )}
      </Card>
      {data.status === 'pending_payment' ? (
        <>
          {data.paymentDueAt ? (
            <Body muted>{t.packs.payBy(dateTime(data.paymentDueAt))}</Body>
          ) : null}
          <PaymentPanel<TripPack>
            subject={{
              path: `/me/trip-packs/${data.id}`,
              payment: data.payment,
              currency: data.currency,
            }}
            onUpdate={pack.mutate}
            reload={pack.reload}
          />
        </>
      ) : null}
      <Body muted>{t.packs.intro}</Body>
    </Screen>
  );
}
