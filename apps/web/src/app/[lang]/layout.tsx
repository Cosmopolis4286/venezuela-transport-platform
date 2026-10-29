import { LOCALES, localeSegment } from '@vtp/shared-types';
import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import { LanguageSwitcher } from '@/components/site/language-switcher';
import { getMessages } from '@/i18n/locale';
import '../globals.css';

/** One static copy of the public website per language: /es, /en, /pt-br. */
export function generateStaticParams() {
  return LOCALES.map((locale) => ({ lang: localeSegment(locale) }));
}

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getMessages();
  return {
    title: { default: t.meta.title, template: '%s · VTP' },
    description: t.meta.description,
    alternates: {
      languages: Object.fromEntries(LOCALES.map((l) => [l, `/${localeSegment(l)}`])),
    },
  };
}

/** Root layout of the public website (search, information pages), in the visitor's language. */
export default async function PublicLayout({ children }: LayoutProps<'/[lang]'>) {
  const { locale, t } = await getMessages();
  return (
    <html lang={locale} className="h-full">
      <body className="flex min-h-full flex-col font-sans">
        <header className="border-b">
          <nav className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-6 py-4">
            <Link href={`/${localeSegment(locale)}`} className="font-semibold">
              VTP
            </Link>
            <div className="flex items-center gap-4">
              <Suspense fallback={null}>
                <LanguageSwitcher current={locale} label={t.header.language} />
              </Suspense>
              <Link
                href="/portal"
                hrefLang="es"
                className="text-sm text-muted-foreground hover:underline"
              >
                {t.header.portal}
              </Link>
            </div>
          </nav>
        </header>
        <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-6 py-16">{children}</main>
      </body>
    </html>
  );
}
