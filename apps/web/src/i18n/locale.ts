import { lang } from 'next/root-params';
import { notFound } from 'next/navigation';
import { localeFromSegment, sharedMessages, type Locale } from '@vtp/shared-types';
import { MESSAGES } from './messages';

/** The locale of the current `/[lang]` page (server only); unknown segments are 404. */
export async function getLocale(): Promise<Locale> {
  const locale = localeFromSegment(await lang());
  if (!locale) notFound();
  return locale;
}

/** Texts of the current `/[lang]` page, plus the locale and the shared texts. */
export async function getMessages() {
  const locale = await getLocale();
  return { locale, t: MESSAGES[locale], shared: sharedMessages(locale) };
}
