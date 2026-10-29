import {
  DEFAULT_LOCALE,
  isLocale,
  matchLocale,
  sharedMessages,
  type Locale,
  type SharedMessages,
} from '@vtp/shared-types';
import { getLocales } from 'expo-localization';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { setActiveLocale } from './active-locale';
import { CORE_MESSAGES, type CoreMessages } from './core-messages';
import { devicePreference, type PreferenceStore } from './preference-store';

/** The user's choice: a language, or `auto` to follow the device. */
export type LocaleChoice = Locale | 'auto';

export interface I18nValue {
  /** The language in use. */
  locale: Locale;
  choice: LocaleChoice;
  setChoice(choice: LocaleChoice): void;
  /** Statuses, labels and error messages shared with the web. */
  shared: SharedMessages;
  /** Texts of the shared sign-in and registration screens. */
  core: CoreMessages;
}

const I18nContext = createContext<I18nValue | null>(null);

/** The device's preferred supported language (Spanish when it prefers none of them). */
export function deviceLocale(): Locale {
  try {
    return matchLocale(getLocales().map((l) => l.languageTag));
  } catch {
    return DEFAULT_LOCALE;
  }
}

/**
 * Provides the app's language: the device's by default, or the one the user chose (remembered on
 * the device). `fixedLocale` pins a language, for apps not translated yet.
 */
export function I18nProvider({
  children,
  fixedLocale,
  store,
}: {
  children: ReactNode;
  fixedLocale?: Locale;
  store?: PreferenceStore;
}) {
  const preference = useMemo(() => store ?? devicePreference('vtp.locale'), [store]);
  const [choice, setChoiceState] = useState<LocaleChoice>('auto');

  useEffect(() => {
    if (fixedLocale) return;
    let active = true;
    void preference
      .load()
      .then((saved) => {
        if (active && isLocale(saved)) setChoiceState(saved);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [preference, fixedLocale]);

  const setChoice = useCallback(
    (next: LocaleChoice) => {
      setChoiceState(next);
      void preference.save(next === 'auto' ? null : next).catch(() => undefined);
    },
    [preference],
  );

  const locale = fixedLocale ?? (choice === 'auto' ? deviceLocale() : choice);
  useLayoutEffect(() => setActiveLocale(locale), [locale]);
  const value = useMemo<I18nValue>(
    () => ({
      locale,
      choice,
      setChoice,
      shared: sharedMessages(locale),
      core: CORE_MESSAGES[locale],
    }),
    [locale, choice, setChoice],
  );
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

/** The language in use and its texts. Outside an `I18nProvider`, Spanish. */
export function useI18n(): I18nValue {
  const value = useContext(I18nContext);
  return (
    value ?? {
      locale: DEFAULT_LOCALE,
      choice: 'auto',
      setChoice: () => undefined,
      shared: sharedMessages(DEFAULT_LOCALE),
      core: CORE_MESSAGES[DEFAULT_LOCALE],
    }
  );
}
