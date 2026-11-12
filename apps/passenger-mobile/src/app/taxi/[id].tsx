import {
  Badge,
  Banner,
  Body,
  Button,
  Card,
  Heading,
  Screen,
  Subheading,
  useApi,
  useAuth,
  userMessage,
} from '@vtp/mobile-core';
import { formatMoney, taxiRideHint, vehicleName, type TaxiRide } from '@vtp/shared-types';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { RefreshControl } from 'react-native';
import { useT } from '@/i18n/use-t';
import { driverLine, isOpenRide } from '@/lib/taxi';
import { formatClock, useSecondsLeft } from '@/lib/use-countdown';

/** While the ride is open, it is reloaded this often to show the taxi as soon as one takes it. */
const POLL_MS = 5000;

const TONES = {
  requested: 'warning',
  accepted: 'success',
  in_progress: 'success',
  completed: 'neutral',
  cancelled: 'danger',
  expired: 'danger',
} as const;

export default function TaxiRideScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { api } = useAuth();
  const { t, shared, locale } = useT();
  const ride = useApi<TaxiRide>(`/me/taxi-rides/${encodeURIComponent(id)}`);
  const { reload, mutate } = ride;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const data = ride.data;
  const open = data ? isOpenRide(data) : false;
  const secondsLeft = useSecondsLeft(data?.status === 'requested' ? data.expiresAt : null);

  useEffect(() => {
    if (!open) return;
    const timer = setInterval(() => void reload(), POLL_MS);
    return () => clearInterval(timer);
  }, [open, reload]);

  const cancel = async () => {
    setBusy(true);
    setError(null);
    try {
      mutate(await api.request<TaxiRide>(`/me/taxi-rides/${id}/cancel`, { method: 'POST' }));
    } catch (e) {
      setError(userMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen
      refreshControl={<RefreshControl refreshing={ride.loading} onRefresh={() => void reload()} />}
    >
      {ride.error ? <Banner tone="error">{ride.error.userMessage}</Banner> : null}
      {data ? (
        <>
          <Heading>{shared.taxiDirection[data.direction]}</Heading>
          <Badge label={shared.taxiRideStatus[data.status]} tone={TONES[data.status]} />
          <Body>{taxiRideHint(data, locale)}</Body>
          {data.status === 'requested' ? (
            <Body muted>{t.taxi.waitsFor(formatClock(secondsLeft))}</Body>
          ) : null}

          {data.vehicle ? (
            <Card>
              <Subheading>{t.taxi.yourTaxi}</Subheading>
              <Body>{t.taxi.plate(vehicleName(data.vehicle))}</Body>
              <Body>{driverLine(data.driver, t.taxi.driver)}</Body>
              {data.organization ? (
                <Body muted>{data.organization.tradeName ?? data.organization.legalName}</Body>
              ) : null}
              {data.fare ? (
                <Body>
                  {t.taxi.fare(formatMoney(data.fare.amount, data.fare.currency, locale))}
                </Body>
              ) : null}
            </Card>
          ) : null}

          <Card>
            <Body>
              {(data.direction === 'from_terminal' ? t.taxi.from : t.taxi.to)(
                data.terminal.name,
                data.terminal.city,
              )}
            </Body>
            <Body muted>
              {(data.direction === 'from_terminal' ? t.taxi.destination : t.taxi.pickup)(
                data.address,
              )}
            </Body>
            <Body muted>
              {t.taxi.people(data.passengers)}
              {data.notes ? ` · ${data.notes}` : ''}
            </Body>
          </Card>

          {error ? <Banner tone="error">{error}</Banner> : null}
          {data.status === 'requested' || data.status === 'accepted' ? (
            <Button
              variant="secondary"
              title={t.taxi.cancel}
              loading={busy}
              onPress={() => void cancel()}
            />
          ) : null}
          {!open ? <Button title={t.taxi.another} onPress={() => router.replace('/taxi')} /> : null}
        </>
      ) : null}
    </Screen>
  );
}
