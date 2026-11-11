import {
  Banner,
  Body,
  Button,
  Card,
  Field,
  Segmented,
  useApi,
  useAuth,
  userMessage,
} from '@vtp/mobile-core';
import {
  formatMoney,
  NETWORK_UTC_OFFSET,
  type OnDemandMode,
  type StretchOption,
  type TaxiRide,
} from '@vtp/shared-types';
import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator } from 'react-native';
import { useT } from '@/i18n/use-t';
import { upcomingDays } from '@/lib/dates';
import { useSearch } from '@/lib/search-context';

const SEATS = (['1', '2', '3', '4'] as const).map((value) => ({ value, label: value }));

/**
 * A taxi or motorcycle on demand between two stops of the corridor (ADR-028), now or for later.
 * The passenger sees each vehicle's fares before asking; no map: the pickup address is written
 * near the origin stop.
 */
export function StretchRideForm() {
  const { api } = useAuth();
  const { t, shared, locale } = useT();
  const { areas } = useSearch();
  // Several corridors: choose one first, so the stops stay a short list.
  const [areaId, setAreaId] = useState<string>('');
  const area = areas.find((a) => a.id === areaId) ?? (areas.length === 1 ? areas[0] : undefined);
  const stops = [...(area?.stops ?? [])].sort((a, b) => a.city.localeCompare(b.city));
  const stopOptions = stops.map((s) => ({ value: s.id, label: s.city }));
  const [from, setFrom] = useState<string>('');
  const [to, setTo] = useState<string>('');
  const [mode, setMode] = useState<OnDemandMode | null>(null);
  const [when, setWhen] = useState<'now' | 'later'>('now');
  const days = upcomingDays(7, undefined, locale, t.home);
  const [day, setDay] = useState(days[0]!.value);
  const [time, setTime] = useState('');
  const [address, setAddress] = useState('');
  const [notes, setNotes] = useState('');
  const [seats, setSeats] = useState<(typeof SEATS)[number]['value']>('1');
  const [busy, setBusy] = useState(false);
  // When the form opened: enough to tell a time that already passed (the API checks it again).
  const [openedAt] = useState(() => Date.now());
  const [error, setError] = useState<string | null>(null);

  const options = useApi<StretchOption[]>(
    from && to && from !== to ? `/taxi/stretch-options?from=${from}&to=${to}` : null,
    { auth: false },
  );
  const chosen = options.data?.find((o) => o.mode === mode) ?? options.data?.[0] ?? null;
  const timeValid = /^([01]\d|2[0-3]):[0-5]\d$/.test(time);
  // The chosen day and time, in Venezuela; it must still be ahead.
  const at = timeValid ? Date.parse(`${day}T${time}:00${NETWORK_UTC_OFFSET}`) : NaN;
  const past = when === 'later' && timeValid && at <= openedAt;
  const timeOk = when === 'now' || (timeValid && !past);
  const ready = chosen !== null && address.trim().length >= 5 && timeOk && !busy;

  const submit = async () => {
    if (!chosen) return;
    setBusy(true);
    setError(null);
    try {
      const ride = await api.request<TaxiRide>('/me/taxi-rides', {
        method: 'POST',
        body: {
          kind: 'stretch',
          fromStopId: from,
          toStopId: to,
          mode: chosen.mode,
          // Venezuelan local time, sent as an instant.
          scheduledFor:
            when === 'later'
              ? new Date(`${day}T${time}:00${NETWORK_UTC_OFFSET}`).toISOString()
              : undefined,
          address: address.trim(),
          notes: notes.trim() || undefined,
          passengers: chosen.mode === 'motorcycle' ? 1 : Number(seats),
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
    <Card>
      {areas.length > 1 ? (
        <Segmented
          label={t.ride.corridor}
          options={areas.map((a) => ({ value: a.id, label: a.name }))}
          value={area?.id ?? ''}
          onChange={(id) => {
            setAreaId(id);
            setFrom('');
            setTo('');
          }}
        />
      ) : null}
      {area ? (
        <>
          <Segmented label={t.ride.from} options={stopOptions} value={from} onChange={setFrom} />
          <Segmented label={t.ride.to} options={stopOptions} value={to} onChange={setTo} />
        </>
      ) : null}
      {options.loading && !options.data ? <ActivityIndicator /> : null}
      {options.data && options.data.length === 0 ? (
        <Banner tone="info">{t.ride.noVehicle}</Banner>
      ) : null}
      {options.data?.length && chosen ? (
        <Segmented
          label={t.ride.vehicle}
          options={options.data.map((o) => ({
            value: o.mode,
            label: `${shared.transportMode[o.mode]} · ${t.ride.price(
              formatMoney(o.minFare, o.currency, locale),
              formatMoney(o.maxFare, o.currency, locale),
            )}`,
          }))}
          value={chosen.mode}
          onChange={setMode}
        />
      ) : null}
      <Segmented
        label={t.ride.when}
        options={[
          { value: 'now', label: t.ride.now },
          { value: 'later', label: t.ride.later },
        ]}
        value={when}
        onChange={setWhen}
      />
      {when === 'later' ? (
        <>
          <Segmented label={t.ride.day} options={days} value={day} onChange={setDay} />
          <Field
            label={t.ride.time}
            placeholder="06:30"
            value={time}
            onChangeText={setTime}
            keyboardType="numbers-and-punctuation"
            maxLength={5}
          />
          {time && !timeValid ? <Body muted>{t.ride.timeInvalid}</Body> : null}
          {past ? <Body muted>{t.ride.timePast}</Body> : null}
        </>
      ) : null}
      <Field
        label={t.ride.pickupLabel}
        placeholder={t.taxi.addressPlaceholder}
        value={address}
        onChangeText={setAddress}
        maxLength={200}
      />
      {chosen?.mode === 'car' ? (
        <Segmented label={t.taxi.passengers} options={SEATS} value={seats} onChange={setSeats} />
      ) : null}
      <Field
        label={t.taxi.notes}
        placeholder={t.taxi.notesPlaceholder}
        value={notes}
        onChangeText={setNotes}
        maxLength={200}
      />
      {error ? <Banner tone="error">{error}</Banner> : null}
      <Button
        title={t.ride.request}
        loading={busy}
        disabled={!ready}
        onPress={() => void submit()}
      />
    </Card>
  );
}
