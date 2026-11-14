import {
  Badge,
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
  userMessage,
} from '@vtp/mobile-core';
import {
  formatMoney,
  longDate,
  networkClock,
  taxiRideHint,
  toNetworkIso,
  vehicleName,
  type RateTaxiRideRequest,
  type TaxiRide,
} from '@vtp/shared-types';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { RefreshControl } from 'react-native';
import { useFeeTotal } from '@/components/pending-fees';
import { useT } from '@/i18n/use-t';
import { driverLine, isOpenRide, ridePlace } from '@/lib/taxi';
import { formatClock, useSecondsLeft } from '@/lib/use-countdown';

const STARS = (['1', '2', '3', '4', '5'] as const).map((value) => ({
  value,
  label: '★'.repeat(Number(value)),
}));

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
  const [stars, setStars] = useState<(typeof STARS)[number]['value']>('5');
  const [comment, setComment] = useState('');
  const data = ride.data;
  const open = data ? isOpenRide(data) : false;
  const secondsLeft = useSecondsLeft(data?.status === 'requested' ? data.expiresAt : null);
  // Cancelling a ride a line took is free until then; afterwards it costs a fee (next ride).
  const freeSecondsLeft = useSecondsLeft(
    data?.status === 'accepted' ? data.freeCancellationUntil : null,
  );
  const lateSecondsLeft = useSecondsLeft(
    data?.status === 'accepted' ? data.lateCancellationEndsAt : null,
  );
  const feesDue = useFeeTotal(data?.feesDue ?? []);
  const lateFee = data?.lateCancellationFee
    ? formatMoney(data.lateCancellationFee.amount, data.lateCancellationFee.currency, locale)
    : null;

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

  const rate = async () => {
    setBusy(true);
    setError(null);
    try {
      const body: RateTaxiRideRequest = {
        rating: Number(stars),
        comment: comment.trim() || undefined,
      };
      mutate(await api.request<TaxiRide>(`/me/taxi-rides/${id}/rate`, { method: 'POST', body }));
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
          <Heading>{ridePlace(data, t, shared)}</Heading>
          {data.scheduledFor ? (
            <Body>
              {t.ride.scheduled(
                `${longDate(toNetworkIso(data.scheduledFor), locale)}, ${networkClock(data.scheduledFor)}`,
              )}
            </Body>
          ) : null}
          <Badge label={shared.taxiRideStatus[data.status]} tone={TONES[data.status]} />
          <Body>{taxiRideHint(data, locale)}</Body>
          {data.tripPack ? (
            <Banner tone="success">{t.ride.paidWithPack(data.tripPack.code)}</Banner>
          ) : null}
          {data.pickupCode && data.status === 'accepted' ? (
            <Card>
              <Subheading>{t.ride.pickupCode}</Subheading>
              <Heading>{data.pickupCode.split('').join(' ')}</Heading>
              <Body muted>{t.ride.pickupCodeHint}</Body>
            </Card>
          ) : null}
          {/* A ride booked for later has no countdown worth showing. */}
          {data.status === 'requested' && !data.scheduledFor ? (
            <Body muted>{t.taxi.waitsFor(formatClock(secondsLeft))}</Body>
          ) : null}

          {data.vehicle ? (
            <Card>
              <Subheading>
                {data.mode === 'motorcycle' ? t.taxi.yourMoto : t.taxi.yourTaxi}
              </Subheading>
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
            {data.terminal ? (
              <>
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
              </>
            ) : (
              <>
                <Body>
                  {data.from?.name} → {data.to?.name}
                </Body>
                <Body muted>{t.taxi.pickup(data.address)}</Body>
              </>
            )}
            <Body muted>
              {t.taxi.people(data.passengers)}
              {data.notes ? ` · ${data.notes}` : ''}
            </Body>
          </Card>

          {feesDue ? <Banner tone="warning">{t.ride.feesDue(feesDue)}</Banner> : null}
          {data.status === 'accepted' && lateFee && data.freeCancellationUntil ? (
            freeSecondsLeft > 0 ? (
              <Body muted>
                {t.ride.freeCancelUntil(networkClock(data.freeCancellationUntil), lateFee)}
              </Body>
            ) : lateSecondsLeft > 0 ? (
              <Banner tone="warning">{t.ride.lateCancel(lateFee)}</Banner>
            ) : (
              <Body muted>{t.ride.driverLate}</Body>
            )
          ) : null}
          {data.status === 'completed' ? (
            <Card>
              {data.rating ? (
                <Body>{t.taxi.rated(data.rating)}</Body>
              ) : (
                <>
                  <Subheading>{t.taxi.rateTitle}</Subheading>
                  <Segmented
                    label={t.taxi.stars(Number(stars))}
                    options={STARS}
                    value={stars}
                    onChange={setStars}
                  />
                  <Field
                    label={t.taxi.rateComment}
                    value={comment}
                    onChangeText={setComment}
                    maxLength={300}
                  />
                  <Button title={t.taxi.rateSend} loading={busy} onPress={() => void rate()} />
                </>
              )}
            </Card>
          ) : null}

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
