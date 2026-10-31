import { useI18n } from '@vtp/mobile-core';
import { MESSAGES } from './messages';

/** The app's texts in the language in use, plus the shared ones and the locale for formatting. */
export function useT() {
  const i18n = useI18n();
  return { ...i18n, t: MESSAGES[i18n.locale] };
}
