import { Banner, Body, Card, Field, Screen, useApi, useColors } from '@vtp/mobile-core';
import { STOP_KIND_LABELS, type Stop } from '@vtp/shared-types';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, Text } from 'react-native';
import { useSearch } from '@/lib/search-context';

/** Searches active terminals and stops; choosing one fills the origin or destination. */
export default function StopPicker() {
  const { field } = useLocalSearchParams<{ field: 'from' | 'to' }>();
  const { setStop } = useSearch();
  const colors = useColors();
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query.trim()), 250);
    return () => clearTimeout(timer);
  }, [query]);
  const stops = useApi<Stop[]>(`/stops${debounced ? `?q=${encodeURIComponent(debounced)}` : ''}`, {
    auth: false,
  });

  return (
    <Screen>
      <Field
        label={field === 'to' ? 'Destino' : 'Origen'}
        placeholder="Ciudad o terminal"
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
              {stop.name} · {STOP_KIND_LABELS[stop.kind]} · {stop.state}
            </Body>
          </Card>
        </Pressable>
      ))}
      {stops.data && stops.data.length === 0 ? (
        <Body muted>No encontramos terminales ni paradas con ese nombre.</Body>
      ) : null}
    </Screen>
  );
}
