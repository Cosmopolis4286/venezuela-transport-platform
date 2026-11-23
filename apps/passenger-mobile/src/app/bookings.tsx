import {
  Badge,
  Banner,
  Body,
  Button,
  Card,
  Row,
  Screen,
  useApi,
  useColors,
  useCurrentUser,
} from '@vtp/mobile-core';
import { localTime, longDate, type Booking } from '@vtp/shared-types';
import { router } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, Text } from 'react-native';
import { useT } from '@/i18n/use-t';
import { BOOKING_TONE } from '@/lib/booking-labels';
import { saveBookings, useSavedTickets } from '@/lib/saved-tickets-store';
import { useSellingZones } from '@/lib/zones';

export default function MyBookings() {
  const colors = useColors();
  const { t, shared, locale } = useT();
  const user = useCurrentUser();
  const bookings = useApi<Booking[]>('/me/bookings');
  const saved = useSavedTickets();
  // Each list loaded with signal refreshes the tickets kept on the phone.
  useEffect(() => {
    if (bookings.data) saveBookings(user.id, bookings.data);
  }, [bookings.data, user.id]);
  // Trip packs live next to the trips, not in a tab of their own; only where a zone sells.
  const zones = useSellingZones();
  return (
    <Screen
      refreshControl={
        <RefreshControl refreshing={bookings.loading} onRefresh={() => void bookings.reload()} />
      }
    >
      {zones.length ? (
        <Button
          variant="secondary"
          title={t.packs.mine}
          onPress={() => router.push('/trip-packs')}
        />
      ) : null}
      {bookings.error ? <Banner tone="error">{bookings.error.userMessage}</Banner> : null}
      {bookings.error && saved.bookings.length ? (
        <>
          <Body muted>{t.saved.noSignal}</Body>
          <Button
            title={t.saved.button(saved.bookings.length)}
            onPress={() => router.push('/saved-tickets')}
          />
        </>
      ) : null}
      {bookings.loading && !bookings.data ? <ActivityIndicator color={colors.text} /> : null}
      {bookings.data?.length === 0 ? <Body muted>{t.bookings.none}</Body> : null}
      {bookings.data?.map((booking) => (
        <Pressable
          key={booking.id}
          accessibilityRole="button"
          accessibilityLabel={t.bookings.a11y(booking.code)}
          onPress={() => router.push({ pathname: '/booking/[id]', params: { id: booking.id } })}
        >
          <Card>
            <Row>
              <Text style={{ color: colors.text, fontSize: 16, fontWeight: '700' }}>
                {booking.from.city} → {booking.to.city}
              </Text>
              <Badge
                label={shared.bookingStatus[booking.status]}
                tone={BOOKING_TONE[booking.status]}
              />
            </Row>
            <Body muted>
              {longDate(booking.trip.departsAt, locale)} · {localTime(booking.trip.departsAt)} ·{' '}
              {t.seats(booking.passengers.length)} · {booking.code}
            </Body>
          </Card>
        </Pressable>
      ))}
    </Screen>
  );
}
