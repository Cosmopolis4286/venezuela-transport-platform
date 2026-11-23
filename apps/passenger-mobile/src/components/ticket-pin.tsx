import { Body, useColors } from '@vtp/mobile-core';
import { Text, View } from 'react-native';
import { useT } from '@/i18n/use-t';

/** The 4 digits a passenger says to the driver when the QR cannot be shown (ADR-052). */
export function TicketPin({ pin }: { pin: string }) {
  const colors = useColors();
  const { t } = useT();
  return (
    <View style={{ gap: 2 }}>
      <Text
        accessibilityLabel={t.booking.pinA11y(pin)}
        style={{ color: colors.text, fontSize: 24, fontWeight: '800', letterSpacing: 4 }}
      >
        {t.booking.pin(pin)}
      </Text>
      <Body muted>{t.booking.pinHelp}</Body>
    </View>
  );
}
