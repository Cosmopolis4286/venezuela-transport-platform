import { DEFAULT_LOCALE, type Locale } from '@vtp/shared-types';

// Errors are turned into text outside React (`ApiError.userMessage`), so the language in use is
// also kept here. `I18nProvider` updates it; this module has no React or Expo dependency.
let activeLocale: Locale = DEFAULT_LOCALE;

export function setActiveLocale(locale: Locale): void {
  activeLocale = locale;
}

export function currentLocale(): Locale {
  return activeLocale;
}
