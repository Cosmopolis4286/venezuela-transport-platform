import {
  daysBetween,
  formatDuration,
  formatMoney,
  localTime,
  localeSegment,
  longDate,
  TRANSPORT_MODES,
  type Departure,
  type TransportMode,
} from '@vtp/shared-types';
import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import { SearchForm } from '@/components/search/search-form';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { getMessages } from '@/i18n/locale';
import { searchDepartures } from '@/lib/server/network';

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getMessages();
  return { title: t.meta.search };
}

const param = (value: string | string[] | undefined) => (typeof value === 'string' ? value : '');

const modeParam = (value: string): TransportMode | null =>
  (TRANSPORT_MODES as readonly string[]).includes(value) ? (value as TransportMode) : null;

export default async function SearchPage({ searchParams }: PageProps<'/[lang]/buscar'>) {
  const { t } = await getMessages();
  return (
    <section className="flex flex-col gap-6">
      <Suspense fallback={<p className="text-muted-foreground">{t.results.searching}</p>}>
        <Results searchParams={searchParams} />
      </Suspense>
    </section>
  );
}

async function Results({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const { locale, t } = await getMessages();
  const from = param(params.from);
  const to = param(params.to);
  const date = param(params.date);
  const mode = modeParam(param(params.mode));
  const complete = from && to && date;
  const result = complete ? await searchDepartures(from, to, date, locale) : null;
  const first = result?.departures?.[0];
  // Every mode is fetched once, so each tab shows how many departures it has.
  const shown = result?.departures?.filter((d) => !mode || d.mode === mode) ?? [];
  const tabHref = (value: TransportMode | null) =>
    `/${localeSegment(locale)}/buscar?${new URLSearchParams({
      from,
      to,
      date,
      ...(value ? { mode: value } : {}),
    })}`;

  return (
    <>
      <SearchForm from={from} to={to} date={date || undefined} />
      {!complete ? (
        <Alert>{t.results.choose}</Alert>
      ) : result?.error ? (
        <Alert variant="destructive">{result.error}</Alert>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h1 className="text-xl font-semibold">
              {first ? `${first.from.city} → ${first.to.city}` : t.results.heading}
            </h1>
            <p className="text-sm text-muted-foreground">
              {longDate(date, locale)} · {t.results.departures(shown.length)} ·{' '}
              <Link
                href={`/${localeSegment(locale)}/buscar?${new URLSearchParams({
                  from: to,
                  to: from,
                  date,
                  ...(mode ? { mode } : {}),
                })}`}
                className="underline"
              >
                {t.results.returnTrip}
              </Link>
            </p>
          </div>
          <ModeTabs current={mode} modes={result!.departures!.map((d) => d.mode)} href={tabHref} />
          {shown.length === 0 ? (
            <Alert>{t.results.none}</Alert>
          ) : (
            <ul className="flex flex-col gap-3">
              {shown.map((departure) => (
                <DepartureCard
                  key={`${departure.scheduleId}:${departure.serviceDate}`}
                  departure={departure}
                />
              ))}
            </ul>
          )}
          <p className="text-xs text-muted-foreground">{t.results.footnote}</p>
        </div>
      )}
    </>
  );
}

/** Links, not buttons: each tab is a shareable URL and works without JavaScript. */
async function ModeTabs({
  current,
  modes,
  href,
}: {
  current: TransportMode | null;
  modes: TransportMode[];
  href: (mode: TransportMode | null) => string;
}) {
  const { t, shared } = await getMessages();
  // Only the modes this search has: no "Moto (0)" on an intercity search, no tabs for one mode.
  const present = TRANSPORT_MODES.filter((value) => modes.includes(value));
  if (present.length < 2 && !current) return null;
  const tabs: { value: TransportMode | null; label: string; count: number }[] = [
    { value: null, label: t.results.allModes, count: modes.length },
    ...present.map((value) => ({
      value,
      label: shared.transportMode[value],
      count: modes.filter((m) => m === value).length,
    })),
  ];
  return (
    <nav aria-label={t.results.modes} className="flex flex-wrap gap-2">
      {tabs.map((tab) => {
        const selected = tab.value === current;
        return (
          <Link
            key={tab.value ?? 'all'}
            href={href(tab.value)}
            aria-current={selected ? 'page' : undefined}
            className={`rounded-full border px-3 py-1 text-sm ${
              selected
                ? 'border-primary bg-primary text-primary-foreground'
                : 'bg-card hover:bg-muted'
            }`}
          >
            {tab.label} <span className="tabular-nums opacity-75">({tab.count})</span>
          </Link>
        );
      })}
    </nav>
  );
}

async function DepartureCard({ departure }: { departure: Departure }) {
  const { locale, t, shared } = await getMessages();
  const extraDays = daysBetween(departure.departsAt, departure.arrivesAt);
  const operator = departure.operator.tradeName ?? departure.operator.legalName;
  return (
    <li className="grid gap-3 rounded-xl border bg-card p-4 sm:grid-cols-[11rem_1fr_auto] sm:items-center sm:gap-6">
      <div className="flex items-baseline gap-2 text-lg font-semibold tabular-nums">
        <time dateTime={departure.departsAt}>{localTime(departure.departsAt)}</time>
        <span className="text-sm font-normal text-muted-foreground">
          → {localTime(departure.arrivesAt)}
          {extraDays ? t.results.dayOffset(extraDays) : ''}
        </span>
      </div>
      <div className="flex flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-medium">{operator}</p>
          <Badge variant="secondary">{shared.transportMode[departure.mode]}</Badge>
          <Badge variant="outline">{shared.serviceClass[departure.serviceClass]}</Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          {departure.from.name} → {departure.to.name} · {formatDuration(departure.durationMinutes)}{' '}
          · {t.results.seatsFree(departure.seatsAvailable, departure.seats)} ·{' '}
          {t.results.route(departure.route.name)}
        </p>
      </div>
      <p className="text-lg font-semibold sm:text-right">
        {departure.fare ? (
          formatMoney(departure.fare.amount, departure.fare.currency, locale)
        ) : (
          <span className="text-sm font-normal text-muted-foreground">
            {t.results.priceAtCounter}
          </span>
        )}
      </p>
    </li>
  );
}
