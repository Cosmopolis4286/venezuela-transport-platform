import { localeSegment } from '@vtp/shared-types';
import Link from 'next/link';
import { Suspense } from 'react';
import { SearchForm } from '@/components/search/search-form';
import { ServiceTabs } from '@/components/search/service-tabs';
import { getMessages } from '@/i18n/locale';
import { getServiceChoice } from '@/lib/server/network';

export default async function HomePage({ searchParams }: PageProps<'/[lang]'>) {
  const { t } = await getMessages();
  return (
    <section className="flex flex-col gap-8">
      <Suspense
        fallback={
          <>
            <div className="flex flex-col gap-3">
              <h1 className="text-3xl font-semibold tracking-tight">{t.home.heading}</h1>
              <p className="max-w-2xl text-muted-foreground">{t.home.intro}</p>
            </div>
            <div className="h-24 rounded-xl border bg-muted/40" />
          </>
        }
      >
        <ServiceSearch searchParams={searchParams} />
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

/**
 * The search box of the chosen service (ADR-029). With one service on sale there is no
 * selector and the page is the plain intercity search it always was.
 */
async function ServiceSearch({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const { locale, t } = await getMessages();
  const { status, open, current } = await getServiceChoice(
    typeof params.service === 'string' ? params.service : '',
  );
  const suburban = current === 'suburban';
  const areas = status.suburban.areas;
  return (
    <>
      <div className="flex flex-col gap-3">
        <h1 className="text-3xl font-semibold tracking-tight">
          {suburban ? t.home.suburbanHeading : t.home.heading}
        </h1>
        <p className="max-w-2xl text-muted-foreground">
          {suburban
            ? areas.length <= 2
              ? t.home.suburbanIntro(areas.map((a) => a.name).join(', '))
              : t.home.suburbanIntroGeneric
            : t.home.intro}
        </p>
      </div>
      <div className="flex flex-col gap-3">
        <ServiceTabs
          open={open}
          current={current}
          href={(service) => `/${localeSegment(locale)}?service=${service}`}
        />
        <SearchForm
          service={open.length > 1 ? current : undefined}
          areas={suburban ? areas : undefined}
        />
      </div>
    </>
  );
}
