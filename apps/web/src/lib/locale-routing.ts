import {
  DEFAULT_LOCALE,
  isLocale,
  localeFromSegment,
  localeSegment,
  matchLocale,
  type Locale,
} from '@vtp/shared-types';

/** Remembers the visitor's language: set whenever a `/[lang]` page is visited. */
export const LOCALE_COOKIE = 'vtp-locale';

/** Public pages that live under `/[lang]`; requests without a language prefix are redirected. */
export const LOCALIZED_PATHS = ['/', '/buscar'];

/**
 * Where a public request goes: a path without a language prefix is redirected to the remembered
 * language, else the browser's (`Accept-Language`), else Spanish. A prefixed path stays.
 */
export function localeRoute(
  pathname: string,
  cookie: string | undefined,
  acceptLanguage: string | null,
): { redirect: string } | { locale: Locale } {
  const segment = pathname.split('/')[1];
  const current = localeFromSegment(segment);
  if (current) return { locale: current };
  const locale = isLocale(cookie)
    ? cookie
    : acceptLanguage
      ? matchLocale(acceptLanguage)
      : DEFAULT_LOCALE;
  return { redirect: `/${localeSegment(locale)}${pathname === '/' ? '' : pathname}` };
}
