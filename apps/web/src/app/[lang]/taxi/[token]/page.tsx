import {
  formatMoney,
  localeSegment,
  networkClock,
  sharedMessages,
  type PublicTaxiRide,
} from '@vtp/shared-types';
import type { Metadata } from 'next';
import { Suspense } from 'react';
import { ActionForm, SubmitButton } from '@/components/portal/action-form';
import { AutoRefresh } from '@/components/portal/auto-refresh';
import { Badge } from '@/components/ui/badge';
import { Card, CardTitle } from '@/components/ui/card';
import { getMessages } from '@/i18n/locale';
import type { Messages } from '@/i18n/messages';
import { ApiError, apiFetch } from '@/lib/server/api';
import { cancelTrackedRide, rateTrackedRide } from './actions';

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getMessages();
  // The link is private to whoever received it: keep it out of search engines.
  return { title: t.track.title, robots: { index: false, follow: false } };
}

/**
 * `/es/taxi/<token>`: the link staff send on WhatsApp after asking for a taxi or moto for someone
 * (ADR-035). No account: it shows the ride, lets the person cancel before pickup and rate it after.
 */
export default function TrackedRidePage({ params }: PageProps<'/[lang]/taxi/[token]'>) {
  return (
    <section className="flex w-full max-w-xl flex-col gap-6">
      <Suspense fallback={<p className="text-muted-foreground">…</p>}>
        <TrackedRide params={params} />
      </Suspense>
    </section>
  );
}

const OPEN = new Set(['requested', 'accepted', 'in_progress']);

async function TrackedRide({ params }: { params: Promise<{ lang: string; token: string }> }) {
  const { token } = await params;
  const { t, locale } = await getMessages();
  const shared = sharedMessages(locale);
  let ride: PublicTaxiRide;
  try {
    ride = await apiFetch<PublicTaxiRide>(`/taxi/track/${encodeURIComponent(token)}`, {
      auth: false,
    });
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      return <p className="text-lg">{t.track.notFound}</p>;
    }
    throw error;
  }
  const hidden = { token, lang: localeSegment(locale) };
  const open = OPEN.has(ride.status);

  return (
    <>
      {open ? <AutoRefresh seconds={15} /> : null}
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold tracking-tight">
          {shared.taxiVehicleType[ride.vehicleType]}
        </h1>
        <div>
          <Badge
            variant={
              ride.status === 'cancelled' || ride.status === 'expired'
                ? 'destructive'
                : ride.status === 'completed'
                  ? 'secondary'
                  : 'success'
            }
          >
            {shared.taxiRideStatus[ride.status]}
          </Badge>
        </div>
        <p className="text-lg">{t.track[ride.status]}</p>
        {open ? <p className="text-sm text-muted-foreground">{t.track.intro}</p> : null}
      </div>

      {ride.vehicle ? (
        <Card>
          <dl className="grid gap-3 text-base sm:grid-cols-2">
            <Item label={t.track.plate}>
              <span className="text-2xl font-semibold tracking-wider">{ride.vehicle.plate}</span>
              {ride.vehicle.label ? ` · ${ride.vehicle.label}` : ''}
            </Item>
            {ride.driverFirstName ? (
              <Item label={t.track.driver}>{ride.driverFirstName}</Item>
            ) : null}
            {ride.line ? <Item label={t.track.line}>{ride.line}</Item> : null}
            {ride.fare ? (
              <Item label={t.track.fare}>
                {formatMoney(ride.fare.amount, ride.fare.currency, locale)}
              </Item>
            ) : null}
          </dl>
        </Card>
      ) : null}

      <Card>
        <dl className="grid gap-3 text-base">
          <Item label={t.track.pickup}>
            {ride.direction === 'from_terminal' ? ride.terminal : ride.address}
          </Item>
          <Item label={t.track.destination}>
            {ride.direction === 'from_terminal'
              ? ride.address
              : ride.direction === 'to_terminal'
                ? ride.terminal
                : (ride.destination ?? '—')}
          </Item>
          {ride.direction === 'local' ? <Item label={t.track.area}>{ride.terminal}</Item> : null}
          <p className="text-sm text-muted-foreground">
            {t.track.passengers(ride.passengers)} · {networkClock(ride.requestedAt)}
          </p>
        </dl>
      </Card>

      {ride.canCancel ? (
        <ActionForm action={cancelTrackedRide} hidden={hidden}>
          <div>
            <SubmitButton variant="outline" size="lg">
              {t.track.cancel}
            </SubmitButton>
          </div>
        </ActionForm>
      ) : null}

      {ride.rating ? <p className="text-lg">{t.track.rated(ride.rating)}</p> : null}
      {ride.canRate ? <RateForm t={t.track} hidden={hidden} /> : null}
    </>
  );
}

function Item({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

function RateForm({ t, hidden }: { t: Messages['track']; hidden: Record<string, string> }) {
  return (
    <Card>
      <CardTitle>{t.rateTitle}</CardTitle>
      <ActionForm action={rateTrackedRide} hidden={hidden}>
        <fieldset className="flex flex-wrap gap-2">
          <legend className="sr-only">{t.rateTitle}</legend>
          {[1, 2, 3, 4, 5].map((n) => (
            <label
              key={n}
              className="flex cursor-pointer flex-col items-center rounded-md border px-3 py-2 has-[:checked]:border-primary has-[:checked]:bg-primary/10"
            >
              <input
                type="radio"
                name="rating"
                value={n}
                defaultChecked={n === 5}
                className="sr-only"
              />
              <span aria-hidden className="text-xl">
                {'★'.repeat(n)}
              </span>
              <span className="text-xs text-muted-foreground">{t.star(n)}</span>
            </label>
          ))}
        </fieldset>
        <label className="flex flex-col gap-1 text-sm">
          {t.comment}
          <textarea
            name="comment"
            maxLength={300}
            rows={3}
            className="rounded-md border bg-background px-3 py-2 text-base"
          />
        </label>
        <div>
          <SubmitButton size="lg">{t.send}</SubmitButton>
        </div>
      </ActionForm>
    </Card>
  );
}
