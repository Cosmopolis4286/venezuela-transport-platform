import { whatsappLink } from '@vtp/shared-types';
import type { Messages } from '@/i18n/messages';
import { getSupportWhatsapp } from '@/lib/server/network';

/** "Message us on WhatsApp", when the server has a support number (`SUPPORT_WHATSAPP`). */
export async function SupportLink({ t }: { t: Messages['support'] }) {
  const number = await getSupportWhatsapp();
  if (!number) return null;
  return (
    <a
      href={whatsappLink(number, t.message)}
      target="_blank"
      rel="noopener noreferrer"
      className="font-medium text-foreground hover:underline"
    >
      {t.whatsapp}
    </a>
  );
}
