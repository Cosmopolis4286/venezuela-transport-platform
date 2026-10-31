'use client';

import { LOCALES, localeSegment, type Locale } from '@vtp/shared-types';
import { usePathname, useSearchParams } from 'next/navigation';
import { cn } from '@/lib/utils';

const SHORT_NAMES: Record<Locale, string> = { es: 'ES', en: 'EN', 'pt-BR': 'PT' };
const FULL_NAMES: Record<Locale, string> = {
  es: 'Español',
  en: 'English',
  'pt-BR': 'Português (Brasil)',
};

/**
 * Links to the same page in each language. Following one also remembers the choice (the proxy
 * stores the language of every `/[lang]` page visited).
 */
export function LanguageSwitcher({ current, label }: { current: Locale; label: string }) {
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const rest = pathname.split('/').slice(2).join('/');
  return (
    <nav aria-label={label} className="flex items-center gap-1 text-sm">
      {LOCALES.map((locale) => (
        <a
          key={locale}
          href={`/${localeSegment(locale)}${rest ? `/${rest}` : ''}${search ? `?${search}` : ''}`}
          hrefLang={locale}
          lang={locale}
          title={FULL_NAMES[locale]}
          aria-label={FULL_NAMES[locale]}
          aria-current={locale === current ? 'true' : undefined}
          className={cn(
            'rounded px-2 py-1',
            locale === current
              ? 'bg-muted font-medium text-foreground'
              : 'text-muted-foreground hover:underline',
          )}
        >
          {SHORT_NAMES[locale]}
        </a>
      ))}
    </nav>
  );
}
