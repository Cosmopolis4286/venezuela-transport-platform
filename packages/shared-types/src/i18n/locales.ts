/**
 * Languages the passenger-facing apps speak. Spanish is the default and the source of every
 * dictionary; English and Brazilian Portuguese are for visitors (PIX and US-dollar payers).
 */
export const LOCALES = ['es', 'en', 'pt-BR'] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = 'es';

/** Names shown in the language selector, each in its own language. */
export const LOCALE_NAMES: Record<Locale, string> = {
  es: 'Español',
  en: 'English',
  'pt-BR': 'Português (Brasil)',
};

/** Locale used for `Intl` dates and numbers. */
export const INTL_LOCALES: Record<Locale, string> = {
  es: 'es-VE',
  en: 'en-US',
  'pt-BR': 'pt-BR',
};

export function isLocale(value: unknown): value is Locale {
  return (LOCALES as readonly unknown[]).includes(value);
}

/** URL path segment of a locale: `es`, `en`, `pt-br`. */
export function localeSegment(locale: Locale): string {
  return locale.toLowerCase();
}

/** The locale of a URL path segment (case-insensitive), or null. */
export function localeFromSegment(segment: string | undefined): Locale | null {
  return LOCALES.find((l) => l.toLowerCase() === segment?.toLowerCase()) ?? null;
}

/**
 * Best supported locale for a list of preferences, most preferred first: an `Accept-Language`
 * header (`pt-BR,pt;q=0.9,en;q=0.8`), or the device's language tags. Any Portuguese becomes
 * `pt-BR`, any English `en`; anything else falls back to Spanish.
 */
export function matchLocale(preferences: string | readonly string[] | null | undefined): Locale {
  const tags =
    typeof preferences === 'string'
      ? preferences
          .split(',')
          .map((part, index) => {
            const [tag = '', ...params] = part.trim().split(';');
            const q = params.map((p) => /^\s*q=([\d.]+)\s*$/.exec(p)?.[1]).find(Boolean);
            return { tag: tag.trim(), q: q === undefined ? 1 : Number(q), index };
          })
          .filter((p) => p.tag && p.q > 0)
          .sort((a, b) => b.q - a.q || a.index - b.index)
          .map((p) => p.tag)
      : (preferences ?? []);
  for (const tag of tags) {
    const language = tag.toLowerCase().split(/[-_]/)[0];
    if (language === 'es') return 'es';
    if (language === 'en') return 'en';
    if (language === 'pt') return 'pt-BR';
  }
  return DEFAULT_LOCALE;
}
