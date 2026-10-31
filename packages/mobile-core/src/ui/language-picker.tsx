import { LOCALES, type Locale } from '@vtp/shared-types';
import { useI18n, type LocaleChoice } from '../i18n/i18n-context';
import { Segmented } from './components';

const SHORT_NAMES: Record<Locale, string> = { es: 'Español', en: 'English', 'pt-BR': 'Português' };

/** Language selector: automatic (the device's) or one of the supported languages. */
export function LanguagePicker() {
  const { choice, setChoice, core } = useI18n();
  const options: { value: LocaleChoice; label: string }[] = [
    { value: 'auto', label: core.language.automatic },
    ...LOCALES.map((locale) => ({ value: locale, label: SHORT_NAMES[locale] })),
  ];
  return (
    <Segmented label={core.language.label} options={options} value={choice} onChange={setChoice} />
  );
}
