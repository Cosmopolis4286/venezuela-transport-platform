import {
  Badge,
  Banner,
  Body,
  Button,
  Card,
  Heading,
  Row,
  Screen,
  Segmented,
  Subheading,
  useApi,
  useAuth,
  useColors,
  userMessage,
} from '@vtp/mobile-core';
import {
  formatPaymentAmount,
  localTime,
  MAX_CASH_PASSENGERS,
  toNetworkIso,
  type CashSale,
  type CashSalesDay,
  type Route,
  type RouteSummary,
} from '@vtp/shared-types';
import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';

const QUICK_COUNTS = ['1', '2', '3', '4', '5', '6'] as const;

/**
 * Cash sales (ADR-033): the driver records the passengers who paid in cash on a route and segment.
 * The amount is the published fare; reports count them apart from app sales.
 */
export default function CashScreen() {
  const { organizationId, name } = useLocalSearchParams<{
    organizationId: string;
    name?: string;
  }>();
  const { api } = useAuth();
  const colors = useColors();
  const base = `/organizations/${organizationId}`;
  const routes = useApi<RouteSummary[]>(organizationId ? `${base}/routes` : null);
  const today = useApi<CashSalesDay>(organizationId ? `${base}/cash-sales/mine` : null);
  const [routeId, setRouteId] = useState<string | null>(null);
  const route = useApi<Route>(routeId ? `${base}/routes/${routeId}` : null);
  const [fromId, setFromId] = useState<string | null>(null);
  const [toId, setToId] = useState<string | null>(null);
  const [count, setCount] = useState<string>('1');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);

  const active = (routes.data ?? []).filter((r) => r.status === 'active');
  const stops = route.data?.stops ?? [];
  const fromIndex = stops.findIndex((s) => s.stop.id === fromId);
  const fare = route.data?.fares.find((f) => f.fromStopId === fromId && f.toStopId === toId);
  const passengers = Math.min(Number(count) || 0, MAX_CASH_PASSENGERS);
  const amount = fare ? (Number(fare.amount) * passengers).toFixed(2) : null;

  const record = async () => {
    if (!routeId || !fromId || !toId || passengers < 1) return;
    setBusy(true);
    setMessage(null);
    try {
      const sale = await api.request<CashSale>(`${base}/cash-sales`, {
        body: { routeId, fromStopId: fromId, toStopId: toId, passengers },
      });
      setMessage({
        tone: 'success',
        text: `Registrado: ${sale.passengers} × ${sale.from.name} → ${sale.to.name}, ${formatPaymentAmount(sale.amount, sale.currency)}.`,
      });
      setCount('1');
      await today.reload();
    } catch (e) {
      setMessage({ tone: 'error', text: userMessage(e) });
    } finally {
      setBusy(false);
    }
  };

  const voidSale = async (sale: CashSale) => {
    setMessage(null);
    try {
      await api.request<CashSale>(`${base}/cash-sales/${sale.id}/void`, {
        body: { reason: 'Anulado por el conductor' },
      });
      await today.reload();
    } catch (e) {
      setMessage({ tone: 'error', text: userMessage(e) });
    }
  };

  const choice = (label: string, selected: boolean, onPress: () => void, key: string) => (
    <Pressable
      key={key}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={{
        borderWidth: 1,
        borderColor: selected ? colors.primary : colors.border,
        backgroundColor: selected ? colors.primary : colors.card,
        borderRadius: 8,
        paddingVertical: 10,
        paddingHorizontal: 12,
      }}
    >
      <Text style={{ color: selected ? colors.primaryText : colors.text, fontWeight: '600' }}>
        {label}
      </Text>
    </Pressable>
  );

  return (
    <Screen>
      <Heading>Ventas en efectivo</Heading>
      <Body muted>
        {name ? `${name} · ` : ''}Anota los pasajeros que te pagaron en efectivo. El monto es la
        tarifa publicada; no lleva cargo de la plataforma.
      </Body>

      <Subheading>Ruta</Subheading>
      {routes.loading && !routes.data ? <ActivityIndicator color={colors.text} /> : null}
      {routes.data && !active.length ? <Body muted>No hay rutas publicadas.</Body> : null}
      <View style={{ gap: 8 }}>
        {active.map((r) =>
          choice(
            r.name,
            r.id === routeId,
            () => {
              setRouteId(r.id);
              setFromId(null);
              setToId(null);
            },
            r.id,
          ),
        )}
      </View>

      {routeId && route.data ? (
        <>
          <Subheading>Sube en</Subheading>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {stops.slice(0, -1).map((s) =>
              choice(
                s.stop.name,
                s.stop.id === fromId,
                () => {
                  setFromId(s.stop.id);
                  setToId(null);
                },
                `from-${s.stop.id}`,
              ),
            )}
          </View>
        </>
      ) : null}

      {fromId ? (
        <>
          <Subheading>Baja en</Subheading>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {stops
              .slice(fromIndex + 1)
              .map((s) =>
                choice(
                  s.stop.name,
                  s.stop.id === toId,
                  () => setToId(s.stop.id),
                  `to-${s.stop.id}`,
                ),
              )}
          </View>
        </>
      ) : null}

      {toId ? (
        <>
          <Segmented
            label="Pasajeros"
            options={QUICK_COUNTS.map((value) => ({ value, label: value }))}
            value={QUICK_COUNTS.includes(count as (typeof QUICK_COUNTS)[number]) ? count : '1'}
            onChange={setCount}
          />
          {fare && amount ? (
            <Body>
              Cobraste {formatPaymentAmount(amount, fare.currency)} ({passengers} ×{' '}
              {formatPaymentAmount(fare.amount, fare.currency)})
            </Body>
          ) : (
            <Banner tone="warning">Este tramo no tiene tarifa publicada.</Banner>
          )}
          <Button
            title="Registrar venta en efectivo"
            loading={busy}
            disabled={!fare || passengers < 1}
            onPress={() => void record()}
          />
        </>
      ) : null}

      {message ? <Banner tone={message.tone}>{message.text}</Banner> : null}

      <Subheading>Hoy</Subheading>
      {today.data?.totals.length ? (
        <Card>
          {today.data.totals.map((t) => (
            <Body key={t.currency}>
              {t.passengers} pasajeros · {formatPaymentAmount(t.amount, t.currency)}
            </Body>
          ))}
        </Card>
      ) : (
        <Body muted>Todavía no registras ventas en efectivo hoy.</Body>
      )}
      {today.data?.sales
        .slice()
        .reverse()
        .map((sale) => (
          <Card key={sale.id}>
            <Row>
              <Badge label={localTime(toNetworkIso(sale.recordedAt))} />
              {sale.voidedAt ? <Badge label="Anulada" tone="warning" /> : null}
            </Row>
            <Body>
              {sale.passengers} × {sale.from.name} → {sale.to.name} ·{' '}
              {formatPaymentAmount(sale.amount, sale.currency)}
            </Body>
            <Body muted>{sale.route.name}</Body>
            {sale.voidedAt ? null : (
              <Button title="Anular" variant="secondary" onPress={() => void voidSale(sale)} />
            )}
          </Card>
        ))}
    </Screen>
  );
}
