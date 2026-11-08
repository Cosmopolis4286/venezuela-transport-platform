import { Banner, Body, Card, Field, Screen, useApi, useColors } from '@vtp/mobile-core';
import type { Stop, StopSummary } from '@vtp/shared-types';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, Text } from 'react-native';
import { useT } from '@/i18n/use-t';
import { useSearch } from '@/lib/search-context';

/** Searches active terminals and stops; choosing one fills the origin or destination. */
export default function StopPicker() {
  const { field } = useLocalSearchParams<{ field: 'from' | 'to' }>();
  const { setStop, service, areas } = useSearch();
  const suburban = service === 'suburban';
  const colors = useColors();
  const { t, shared } = useT();
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query.trim()), 250);
    return () => clearTimeout(timer);
  }, [query]);
  const catalog = useApi<Stop[] | StopSummary[]>(
    suburban ? null : `/stops${debounced ? `?q=${encodeURIComponent(debounced)}` : ''}`,
    { auth: false },
  );
  // Suburban: only the stops of the active corridors, filtered here (a short list).
  const needle = debounced.toLowerCase();
  const corridorStops = [...new Map(areas.flatMap((a) => a.stops).map((s) => [s.id, s])).values()]
    .filter((s) => !needle || `${s.city} ${s.name}`.toLowerCase().includes(needle))
    .sort((a, b) => a.city.localeCompare(b.city) || a.name.localeCompare(b.name));
  const stops = suburban ? { data: corridorStops, error: undefined, loading: false } : catalog;

  return (
    <Screen>
      <Field
        label={field === 'to' ? t.home.destination : t.home.origin}
        placeholder={t.stopPicker.placeholder}
        value={query}
        onChangeText={setQuery}
        autoFocus
        autoCorrect={false}
      />
      {stops.error ? <Banner tone="error">{stops.error.userMessage}</Banner> : null}
      {stops.loading && !stops.data ? <ActivityIndicator color={colors.text} /> : null}
      {stops.data?.map((stop) => (
        <Pressable
          key={stop.id}
          accessibilityRole="button"
          accessibilityLabel={`${stop.city}, ${stop.name}`}
          onPress={() => {
            setStop(field === 'to' ? 'to' : 'from', stop);
            router.back();
          }}
        >
          <Card>
            <Text style={{ color: colors.text, fontSize: 16, fontWeight: '600' }}>{stop.city}</Text>
            <Body muted>
              {stop.name} · {shared.stopKind[stop.kind]} · {stop.state}
            </Body>
          </Card>
        </Pressable>
      ))}
      {stops.data && stops.data.length === 0 ? <Body muted>{t.stopPicker.none}</Body> : null}
    </Screen>
  );
}
