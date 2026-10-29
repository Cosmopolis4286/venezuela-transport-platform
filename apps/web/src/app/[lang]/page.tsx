import Link from 'next/link';
import { Suspense } from 'react';
import { SearchForm } from '@/components/search/search-form';
import { getMessages } from '@/i18n/locale';

export default async function HomePage() {
  const { t } = await getMessages();
  return (
    <section className="flex flex-col gap-8">
      <div className="flex flex-col gap-3">
        <h1 className="text-3xl font-semibold tracking-tight">{t.home.heading}</h1>
        <p className="max-w-2xl text-muted-foreground">{t.home.intro}</p>
      </div>
      <Suspense fallback={<div className="h-24 rounded-xl border bg-muted/40" />}>
        <SearchForm />
      </Suspense>
      <p className="text-sm text-muted-foreground">
        {t.home.operatorsBefore}{' '}
        <Link href="/portal" hrefLang="es" className="underline">
          {t.home.operatorsLink}
        </Link>
        .
      </p>
    </section>
  );
}
