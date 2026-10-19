import {
  daysBetween,
  formatDuration,
  formatMoney,
  localTime,
  longDate,
  ORGANIZATION_TYPE_LABELS,
  SERVICE_CLASS_LABELS,
  type Departure,
} from '@vtp/shared-types';
import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import { SearchForm } from '@/components/search/search-form';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { searchDepartures } from '@/lib/server/network';

export const metadata: Metadata = { title: 'Buscar viajes' };

const param = (value: string | string[] | undefined) => (typeof value === 'string' ? value : '');

export default function SearchPage({ searchParams }: PageProps<'/buscar'>) {
  return (
    <section className="flex flex-col gap-6">
      <Suspense fallback={<p className="text-muted-foreground">Buscando…</p>}>
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
  const from = param(params.from);
  const to = param(params.to);
  const date = param(params.date);
  const complete = from && to && date;
  const result = complete ? await searchDepartures(from, to, date) : null;
  const first = result?.departures?.[0];

  return (
    <>
      <SearchForm from={from} to={to} date={date || undefined} />
      {!complete ? (
        <Alert>Elige el origen, el destino y la fecha.</Alert>
      ) : result?.error ? (
        <Alert variant="destructive">{result.error}</Alert>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h1 className="text-xl font-semibold">
              {first ? `${first.from.city} → ${first.to.city}` : 'Resultados'}
            </h1>
            <p className="text-sm text-muted-foreground">
              {longDate(date)} · {result!.departures!.length}{' '}
              {result!.departures!.length === 1 ? 'salida' : 'salidas'} ·{' '}
              <Link href={`/buscar?from=${to}&to=${from}&date=${date}`} className="underline">
                Ver el regreso
              </Link>
            </p>
          </div>
          {result!.departures!.length === 0 ? (
            <Alert>
              No hay salidas publicadas para ese día. Prueba con otra fecha o con una terminal
              cercana.
            </Alert>
          ) : (
            <ul className="flex flex-col gap-3">
              {result!.departures!.map((departure) => (
                <DepartureCard
                  key={`${departure.scheduleId}:${departure.serviceDate}`}
                  departure={departure}
                />
              ))}
            </ul>
          )}
          <p className="text-xs text-muted-foreground">
            Horas de Venezuela. La compra de boletos en línea llegará pronto; por ahora compra en la
            taquilla de la empresa.
          </p>
        </div>
      )}
    </>
  );
}

function DepartureCard({ departure }: { departure: Departure }) {
  const extraDays = daysBetween(departure.departsAt, departure.arrivesAt);
  const operator = departure.operator.tradeName ?? departure.operator.legalName;
  return (
    <li className="grid gap-3 rounded-xl border bg-card p-4 sm:grid-cols-[11rem_1fr_auto] sm:items-center sm:gap-6">
      <div className="flex items-baseline gap-2 text-lg font-semibold tabular-nums">
        <time dateTime={departure.departsAt}>{localTime(departure.departsAt)}</time>
        <span className="text-sm font-normal text-muted-foreground">
          → {localTime(departure.arrivesAt)}
          {extraDays ? ` (+${extraDays} d)` : ''}
        </span>
      </div>
      <div className="flex flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-medium">{operator}</p>
          <Badge variant="outline">{SERVICE_CLASS_LABELS[departure.serviceClass]}</Badge>
          {departure.operator.type === 'taxi_line' ? (
            <Badge variant="secondary">{ORGANIZATION_TYPE_LABELS.taxi_line}</Badge>
          ) : null}
        </div>
        <p className="text-sm text-muted-foreground">
          {departure.from.name} → {departure.to.name} · {formatDuration(departure.durationMinutes)}{' '}
          · {departure.seats} puestos · ruta {departure.route.name}
        </p>
      </div>
      <p className="text-lg font-semibold sm:text-right">
        {departure.fare ? (
          formatMoney(departure.fare.amount, departure.fare.currency)
        ) : (
          <span className="text-sm font-normal text-muted-foreground">Precio en taquilla</span>
        )}
      </p>
    </li>
  );
}
