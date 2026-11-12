/**
 * How passengers, operators and drivers reach the platform's support. `GET /support` (public);
 * the number comes from the server's configuration (`SUPPORT_WHATSAPP`), so it changes without
 * rebuilding the apps. Null hides the WhatsApp button.
 */
export interface SupportContact {
  /** International number, digits only (e.g. 584121234567). */
  whatsapp: string | null;
  /**
   * Where to download the passenger app for Android (`ANDROID_APP_URL`): the APK during the pilot,
   * Google Play afterwards. The web's `/app` page links to it, so shared links never change.
   */
  androidApp: string | null;
}

/** `+58 412-123.4567` → `584121234567`; null unless it has 8 to 15 digits. */
export function normalizeWhatsapp(input: string | null | undefined): string | null {
  const digits = (input ?? '').replace(/[\s()+.-]/g, '');
  return /^\d{8,15}$/.test(digits) ? digits : null;
}

/** A link that opens a WhatsApp chat with `number`, with an optional message already typed. */
export function whatsappLink(number: string, text?: string): string {
  const base = `https://wa.me/${number}`;
  return text ? `${base}?text=${encodeURIComponent(text)}` : base;
}
