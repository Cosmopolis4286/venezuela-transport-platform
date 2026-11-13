import {
  Badge,
  Banner,
  Body,
  Button,
  Card,
  Heading,
  Row,
  Screen,
  Subheading,
  useApi,
  useAuth,
  useColors,
  userMessage,
} from '@vtp/mobile-core';
import {
  formatMoney,
  longDate,
  toNetworkIso,
  type TripPack,
  type TripPackProduct,
} from '@vtp/shared-types';
import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, Text } from 'react-native';
import { useT } from '@/i18n/use-t';
import { PACK_TONE } from '@/lib/trip-packs';

/** The passenger's trip packs and those on sale in the active corridors (ADR-028). */
export default function TripPacks() {
  const colors = useColors();
  const { api } = useAuth();
  const { t, shared, locale } = useT();
  const mine = useApi<TripPack[]>('/me/trip-packs');
  const products = useApi<TripPackProduct[]>('/trip-pack-products', { auth: false });
  const [buying, setBuying] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const buy = async (product: TripPackProduct) => {
    setBuying(product.id);
    setError(null);
    try {
      const pack = await api.request<TripPack>('/me/trip-packs', {
        method: 'POST',
        body: { productId: product.id },
      });
      router.push({ pathname: '/trip-packs/[id]', params: { id: pack.id } });
      void mine.reload();
    } catch (e) {
      setError(userMessage(e));
    } finally {
      setBuying(null);
    }
  };

  // Packs that still matter first; used ones stay below for reference.
  const current = mine.data?.filter((p) => p.status === 'active' || p.status === 'pending_payment');
  const past = mine.data?.filter((p) => p.status !== 'active' && p.status !== 'pending_payment');

  return (
    <Screen
      refreshControl={
        <RefreshControl
          refreshing={mine.loading || products.loading}
          onRefresh={() => {
            void mine.reload();
            void products.reload();
          }}
        />
      }
    >
      <Heading>{t.packs.title}</Heading>
      <Body muted>{t.packs.intro}</Body>
      {error ? <Banner tone="error">{error}</Banner> : null}

      {current?.length ? <Subheading>{t.packs.mine}</Subheading> : null}
      {current?.map((pack) => (
        <PackCard key={pack.id} pack={pack} />
      ))}

      <Subheading>{t.packs.forSale}</Subheading>
      {products.loading && !products.data ? <ActivityIndicator color={colors.text} /> : null}
      {products.data?.length === 0 ? <Body muted>{t.packs.none}</Body> : null}
      {products.data?.map((product) => (
        <Card key={product.id}>
          <Row>
            <Text style={{ color: colors.text, fontSize: 16, fontWeight: '700', flexShrink: 1 }}>
              {t.packs.product(product.trips, product.stops[0].city, product.stops[1].city)}
            </Text>
            <Badge label={shared.transportMode[product.mode]} />
          </Row>
          <Text style={{ color: colors.text, fontSize: 18, fontWeight: '700' }}>
            {formatMoney(product.price, product.currency, locale)}
          </Text>
          <Body muted>
            {t.packs.perTrip(formatMoney(product.unitPrice, product.currency, locale))} ·{' '}
            {t.packs.validity(product.validityDays)}
          </Body>
          <Button
            title={t.packs.buy}
            variant="secondary"
            loading={buying === product.id}
            disabled={buying !== null}
            onPress={() => void buy(product)}
          />
        </Card>
      ))}

      {past?.length ? <Subheading>{shared.bookingStatus.expired}</Subheading> : null}
      {past?.map((pack) => (
        <PackCard key={pack.id} pack={pack} />
      ))}
      {mine.error ? <Banner tone="error">{mine.error.userMessage}</Banner> : null}
    </Screen>
  );
}

export function PackCard({ pack }: { pack: TripPack }) {
  const colors = useColors();
  const { t, shared, locale } = useT();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t.packs.a11y(pack.code)}
      onPress={() => router.push({ pathname: '/trip-packs/[id]', params: { id: pack.id } })}
    >
      <Card>
        <Row>
          <Text style={{ color: colors.text, fontSize: 16, fontWeight: '700', flexShrink: 1 }}>
            {t.packs.product(pack.trips, pack.stops[0].city, pack.stops[1].city)}
          </Text>
          <Badge label={t.packs.status[pack.status]} tone={PACK_TONE[pack.status]} />
        </Row>
        <Body muted>
          {shared.transportMode[pack.mode]} · {pack.code}
          {pack.status === 'active' ? ` · ${t.packs.remaining(pack.remaining, pack.trips)}` : ''}
        </Body>
        {pack.status === 'active' && pack.expiresAt ? (
          <Body muted>{t.packs.expires(longDate(toNetworkIso(pack.expiresAt), locale))}</Body>
        ) : null}
      </Card>
    </Pressable>
  );
}
