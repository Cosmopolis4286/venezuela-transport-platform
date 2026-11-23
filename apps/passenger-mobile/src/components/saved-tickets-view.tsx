import { Badge, Banner, Body, Button, Card, Heading, Row, Screen } from '@vtp/mobile-core';
import { localTime, longDate } from '@vtp/shared-types';
import { View } from 'react-native';
import { QrCode } from '@/components/qr-code';
import { TicketPin } from '@/components/ticket-pin';
import { useT } from '@/i18n/use-t';
import { useSavedTickets } from '@/lib/saved-tickets-store';

/**
 * The paid tickets kept on this phone, shown without signal and without a session: the QR codes
 * the driver scans (ADR-050). `onBack` is for when it is shown outside the navigator.
 */
export function SavedTicketsView({ onBack }: { onBack?: () => void }) {
  const { t, locale } = useT();
  const saved = useSavedTickets();
  return (
    <Screen>
      {onBack ? <Button variant="link" title={t.saved.back} onPress={onBack} /> : null}
      <Body muted>{t.saved.intro}</Body>
      {saved.savedAt ? (
        <Body muted>
          {t.saved.savedAt(longDate(saved.savedAt, locale), localTime(saved.savedAt))}
        </Body>
      ) : null}
      {saved.bookings.length === 0 ? <Banner tone="info">{t.saved.none}</Banner> : null}
      {saved.bookings.map((booking) => (
        <View key={booking.id} style={{ gap: 8 }}>
          <Heading>
            {booking.from} → {booking.to}
          </Heading>
          <Body>
            {longDate(booking.departsAt, locale)} · {localTime(booking.departsAt)} ·{' '}
            {booking.operator}
          </Body>
          <Body muted>
            {t.booking.code}: {booking.code}
          </Body>
          {booking.passengers.map((p) => (
            <Card key={p.seatNumber}>
              <Row>
                <Badge label={booking.open ? t.ticket(p.seatNumber) : t.seat(p.seatNumber)} />
                {p.boardedAt ? <Badge label={t.booking.boarded} tone="success" /> : null}
              </Row>
              <Heading>{p.name}</Heading>
              <Body muted>{p.document}</Body>
              <View style={{ paddingVertical: 8 }}>
                <QrCode value={p.qr} />
              </View>
              {p.pin ? <TicketPin pin={p.pin} /> : null}
            </Card>
          ))}
        </View>
      ))}
    </Screen>
  );
}
