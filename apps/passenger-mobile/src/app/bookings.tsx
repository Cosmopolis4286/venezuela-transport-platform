import { Badge, Banner, Body, Card, Row, Screen, useApi, useColors } from '@vtp/mobile-core';
import { localTime, longDate, type Booking } from '@vtp/shared-types';
import { router } from 'expo-router';
import { ActivityIndicator, Pressable, RefreshControl, Text } from 'react-native';
import { useT } from '@/i18n/use-t';
import { BOOKING_TONE } from '@/lib/booking-labels';

export default function MyBookings() {
  const colors = useColors();
  const { t, shared, locale } = useT();
  const bookings = useApi<Booking[]>('/me/bookings');
  return (
    <Screen
      refreshControl={
        <RefreshControl refreshing={bookings.loading} onRefresh={() => void bookings.reload()} />
      }
    >
      {bookings.error ? <Banner tone="error">{bookings.error.userMessage}</Banner> : null}
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
