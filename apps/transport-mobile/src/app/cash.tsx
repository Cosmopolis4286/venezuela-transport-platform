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
  useCurrentUser,
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
import { noSignal, withTimeout } from '@/lib/no-signal';
import { newClientId } from '@/lib/outbox';
import { enqueue, useOutbox } from '@/lib/outbox-store';
import { SavedAt } from '@/lib/saved-at';

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
  const user = useCurrentUser();
  const outbox = useOutbox();
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
  // Recorded without signal, still to send (ADR-051).
  const unsent = outbox.pending.flatMap((item) =>
    item.kind === 'cash' && item.organizationId === organizationId ? [item] : [],
  );

  const record = async () => {
    if (!routeId || !fromId || !toId || passengers < 1) return;
    setBusy(true);
    setMessage(null);
    // Its own id and time: sent again later (no signal), it is still one sale (ADR-051).
    const body = {
      routeId,
      fromStopId: fromId,
      toStopId: toId,
      passengers,
      clientId: newClientId(),
      soldAt: new Date().toISOString(),
    };
    try {
      const sale = await withTimeout(api.request<CashSale>(`${base}/cash-sales`, { body }));
      setMessage({
        tone: 'success',
        text: `Registrado: ${sale.passengers} × ${sale.from.name} → ${sale.to.name}, ${formatPaymentAmount(sale.amount, sale.currency)}.`,
      });
      setCount('1');
      await today.reload();
    } catch (e) {
      if (noSignal(e) && fare && amount) {
        const from = stops.find((s) => s.stop.id === fromId)?.stop.name ?? '';
        const to = stops.find((s) => s.stop.id === toId)?.stop.name ?? '';
        enqueue(api, user.id, {
          id: body.clientId,
          kind: 'cash',
          organizationId,
          body,
          label: `${passengers} × ${from} → ${to}, ${formatPaymentAmount(amount, fare.currency)}`,
        });
        setMessage({
          tone: 'success',
          text: 'Guardada sin señal. Se enviará sola cuando vuelva la señal.',
        });
        setCount('1');
      } else {
        setMessage({ tone: 'error', text: userMessage(e) });
      }
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

      {routes.savedAt ? <SavedAt savedAt={routes.savedAt} /> : null}

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

      {routeId && !route.data && route.error ? (
        <Banner tone="warning">
          Sin señal y esta ruta no está guardada en el teléfono. Ábrela una vez con señal.
        </Banner>
      ) : null}
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

      {unsent.length ? (
        <>
          <Subheading>Por enviar ({unsent.length})</Subheading>
          {unsent.map((item) => (
            <Card key={item.id}>
              <Row>
                <Badge label={localTime(toNetworkIso(item.body.soldAt))} />
                <Badge label="Sin enviar" tone="warning" />
              </Row>
              <Body>{item.label}</Body>
            </Card>
          ))}
        </>
      ) : null}

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
