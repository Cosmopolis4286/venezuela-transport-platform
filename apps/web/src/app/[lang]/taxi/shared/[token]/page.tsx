import {
  EMERGENCY_PHONE,
  networkClock,
  sharedMessages,
  type PublicTaxiRide,
} from '@vtp/shared-types';
import type { Metadata } from 'next';
import { Suspense } from 'react';
import { AutoRefresh } from '@/components/portal/auto-refresh';
import { Badge } from '@/components/ui/badge';
import { DriverMap } from '@/components/taxi/driver-map';
import { Card } from '@/components/ui/card';
import { getMessages } from '@/i18n/locale';
import { ApiError, apiFetch } from '@/lib/server/api';

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getMessages();
  // Private to whoever received the link: keep it out of search engines.
  return { title: t.track.sharedTitle, robots: { index: false, follow: false } };
}

/**
 * `/es/taxi/shared/<token>`: a ride a passenger shared with people they trust (ADR-043). Read-only:
 * the plate, the driver's first name, the route and where the driver is while the ride is open.
 */
export default function SharedRidePage({ params }: PageProps<'/[lang]/taxi/shared/[token]'>) {
  return (
    <section className="flex w-full max-w-xl flex-col gap-6">
      <Suspense fallback={<p className="text-muted-foreground">…</p>}>
        <SharedRide params={params} />
      </Suspense>
    </section>
  );
}

const OPEN = new Set(['requested', 'accepted', 'in_progress']);

async function SharedRide({ params }: { params: Promise<{ lang: string; token: string }> }) {
  const { token } = await params;
  const { t, locale } = await getMessages();
  const shared = sharedMessages(locale);
  let ride: PublicTaxiRide;
  try {
    ride = await apiFetch<PublicTaxiRide>(`/taxi/shared/${encodeURIComponent(token)}`, {
      auth: false,
    });
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      return <p className="text-lg">{t.track.notFound}</p>;
    }
    throw error;
  }
  const open = OPEN.has(ride.status);
  const route =
    ride.kind === 'stretch'
      ? `${ride.from} → ${ride.to}`
      : ride.direction === 'from_terminal'
        ? `${ride.terminal} → ${ride.address}`
        : `${ride.address} → ${ride.terminal}`;

  return (
    <>
      {open ? <AutoRefresh seconds={15} /> : null}
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold tracking-tight">{t.track.sharedTitle}</h1>
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
            {shared.transportMode[ride.mode]} · {shared.taxiRideStatus[ride.status]}
          </Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          {open ? t.track.sharedIntro : t.track.sharedEnded}
        </p>
      </div>

      <Card>
        <dl className="grid gap-3 text-base sm:grid-cols-2">
          <Item label={t.track.destination}>{route}</Item>
          {ride.vehicle ? (
            <Item label={t.track.plate}>
              <span className="text-2xl font-semibold tracking-wider">{ride.vehicle.plate}</span>
              {ride.vehicle.label ? ` · ${ride.vehicle.label}` : ''}
            </Item>
          ) : null}
          {ride.driverFirstName ? <Item label={t.track.driver}>{ride.driverFirstName}</Item> : null}
          {ride.line ? <Item label={t.track.line}>{ride.line}</Item> : null}
          {ride.etaMinutes !== null ? (
            <Item label={t.track.eta}>{t.track.minutes(ride.etaMinutes)}</Item>
          ) : null}
          <Item label={t.track.at}>{networkClock(ride.pickedUpAt ?? ride.requestedAt)}</Item>
        </dl>
        <DriverMap ride={ride} label={t.track.driverMap} />
      </Card>
      {open ? (
        <p className="text-sm text-muted-foreground">{t.track.emergency(EMERGENCY_PHONE)}</p>
      ) : null}
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
