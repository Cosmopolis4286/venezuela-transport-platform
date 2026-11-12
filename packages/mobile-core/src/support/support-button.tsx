import { whatsappLink, type SupportContact } from '@vtp/shared-types';
import { Linking } from 'react-native';
import { useApi } from '../api/use-api';
import { useI18n } from '../i18n/i18n-context';
import { Button } from '../ui/components';

/**
 * "Message us on WhatsApp": opens a chat with support, with a message already typed (naming the
 * booking when there is one). Hidden until
 * the server has a support number (`SUPPORT_WHATSAPP`), so it changes without a new app build.
 */
export function SupportButton({ bookingCode }: { bookingCode?: string }) {
  const { core } = useI18n();
  const support = useApi<SupportContact>('/support', { auth: false });
  const number = support.data?.whatsapp;
  if (!number) return null;
  return (
    <Button
      variant="secondary"
      title={core.support.whatsapp}
      onPress={() =>
        void Linking.openURL(
          whatsappLink(
            number,
            bookingCode ? core.support.aboutBooking(bookingCode) : core.support.message,
          ),
        )
      }
    />
  );
}
