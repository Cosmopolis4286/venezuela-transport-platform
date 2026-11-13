import {
  CURRENCIES,
  DEFAULT_TRIP_PACK_VALIDITY_DAYS,
  formatMoney,
  networkClock,
  PLATFORM_RATE_MAX_HOURS,
  RATE_CURRENCIES,
  toNetworkIso,
  TRANSPORT_MODE_LABELS,
  TRANSPORT_MODES,
  type ExchangeRate,
  type RateCurrency,
  type OperatingZone,
  type Stop,
  type TripPackProduct,
} from '@vtp/shared-types';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ActionForm, SubmitButton } from '@/components/portal/action-form';
import { Badge } from '@/components/ui/badge';
import { Card, CardDescription, CardTitle } from '@/components/ui/card';
import { Input, Select } from '@/components/ui/input';
import { Field } from '@/components/ui/label';
import { apiFetch } from '@/lib/server/api';
import { getCurrentUser } from '@/lib/server/session';
import { createTripPackProduct, savePlatformRates, setTripPackProductActive } from './actions';

const RATE_LABELS: Record<RateCurrency, string> = {
  VES: 'Bolívares (Bs.) por dólar — pago móvil y transferencia',
  BRL: 'Reales (R$) por dólar — PIX',
};

/**
 * Trip packs the platform sells (ADR-035): the catalog per zone and stretch, and the
 * platform's exchange rates their prices are converted with. Platform admins only.
 */
export default async function TripPacksPage() {
  const user = await getCurrentUser();
  if (user.platformRole !== 'admin') redirect('/admin');
  const [products, zones, allStops, rates] = await Promise.all([
    apiFetch<TripPackProduct[]>('/admin/trip-pack-products'),
    apiFetch<OperatingZone[]>('/admin/zones'),
    apiFetch<Stop[]>('/admin/stops'),
    apiFetch<ExchangeRate[]>('/admin/exchange-rates'),
  ]);
  // Packs are sold per zone (ADR-028), between two of its stops.
  const areas: Area[] = zones.map((z) => ({
    id: z.id,
    name: z.name,
    active: z.status === 'active',
    stops: allStops.filter((s) => s.zoneId === z.id),
  }));
  const rateFor = (currency: RateCurrency) => rates.find((r) => r.currency === currency);

  return (
    <>
      <div className="flex flex-col gap-2">
        <Link href="/admin" className="text-sm text-muted-foreground hover:underline">
          ← Revisiones pendientes
        </Link>
        <h1 className="text-2xl font-semibold">Paquetes de viajes</h1>
        <p className="text-sm text-muted-foreground">
          Viajes de un tramo de una zona, en un tipo de vehículo, que la plataforma vende por
          adelantado. Sirven en los dos sentidos, vencen y no se devuelven. Cada viaje usado le paga
          a la empresa su tarifa normal del tramo.
        </p>
      </div>

      <Card>
        <CardTitle>Catálogo · {products.length}</CardTitle>
        {products.length === 0 ? (
          <p className="text-sm text-muted-foreground">Todavía no hay paquetes.</p>
        ) : (
          <ul className="flex flex-col divide-y">
            {products.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium">
                      {p.trips} viajes · {p.stops[0].city} ↔ {p.stops[1].city}
                    </p>
                    <Badge variant="outline">{TRANSPORT_MODE_LABELS[p.mode]}</Badge>
                    {p.active ? null : <Badge variant="secondary">No se vende</Badge>}
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {formatMoney(p.price, p.currency)} ({formatMoney(p.unitPrice, p.currency)} por
                    viaje) · vence a los {p.validityDays} días · {p.zone.name}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {p.maxFare
                      ? `La plataforma paga a la empresa hasta ${formatMoney(p.maxFare, p.currency)} por viaje usado.`
                      : 'Sin tope: la plataforma paga la tarifa de cada empresa, aunque la suba.'}
                  </p>
                </div>
                <ActionForm
                  action={setTripPackProductActive}
                  hidden={{ productId: p.id, active: String(!p.active) }}
                >
                  <SubmitButton size="sm" variant="outline">
                    {p.active ? 'Dejar de vender' : 'Vender'}
                  </SubmitButton>
                </ActionForm>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <CardTitle>Nuevo paquete</CardTitle>
        {areas.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Primero crea una zona y asígnale paradas en <Link href="/admin/zones">Zonas</Link>.
          </p>
        ) : (
          <ActionForm action={createTripPackProduct} resetOnSuccess>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Desde" htmlFor="stopA" hint="El paquete sirve en los dos sentidos.">
                <StopSelect id="stopA" areas={areas} />
              </Field>
              <Field label="Hasta" htmlFor="stopB">
                <StopSelect id="stopB" areas={areas} />
              </Field>
              <Field label="Zona" htmlFor="zoneId">
                <Select id="zoneId" name="zoneId" required>
                  {areas.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                      {a.active ? '' : ' (no vende)'}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Vehículo" htmlFor="mode">
                <Select id="mode" name="mode" defaultValue="bus">
                  {TRANSPORT_MODES.map((m) => (
                    <option key={m} value={m}>
                      {TRANSPORT_MODE_LABELS[m]}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Viajes" htmlFor="trips">
                <Input id="trips" name="trips" type="number" min={2} max={100} required />
              </Field>
              <div className="flex items-end gap-2">
                <Field label="Precio" htmlFor="price">
                  <Input id="price" name="price" inputMode="decimal" required />
                </Field>
                <Select name="currency" aria-label="Moneda" defaultValue="USD" className="w-24">
                  {CURRENCIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </Select>
              </div>
              <Field label="Vigencia (días)" htmlFor="validityDays">
                <Input
                  id="validityDays"
                  name="validityDays"
                  type="number"
                  min={1}
                  max={365}
                  defaultValue={DEFAULT_TRIP_PACK_VALIDITY_DAYS}
                />
              </Field>
              <Field label="Tope por viaje (opcional)" htmlFor="maxFare">
                <Input id="maxFare" name="maxFare" inputMode="decimal" placeholder="Sin tope" />
              </Field>
            </div>
            <div>
              <SubmitButton>Agregar al catálogo</SubmitButton>
            </div>
          </ActionForm>
        )}
      </Card>

      <Card>
        <div className="flex flex-col gap-1">
          <CardTitle>Tasas de cambio de la plataforma</CardTitle>
          <CardDescription>
            Convierten el precio de los paquetes al cobrar (las empresas tienen las suyas para sus
            boletos). USDT se cobra 1:1 con el dólar. Sin tasa, o con una de más de{' '}
            {PLATFORM_RATE_MAX_HOURS} horas, ese medio de pago no se ofrece: guárdalas al menos una
            vez al día, aunque no cambien.
            {rates.length
              ? ` Última actualización: ${networkClock(rates[0]!.updatedAt)} del ${toNetworkIso(rates[0]!.updatedAt).slice(0, 10)}.`
              : ''}
          </CardDescription>
        </div>
        <ActionForm action={savePlatformRates}>
          <div className="grid gap-3 sm:grid-cols-2">
            {RATE_CURRENCIES.map((currency) => (
              <Field key={currency} label={RATE_LABELS[currency]} htmlFor={`rate-${currency}`}>
                <Input
                  id={`rate-${currency}`}
                  name={`rate:${currency}`}
                  inputMode="decimal"
                  defaultValue={
                    rateFor(currency) ? String(Number(rateFor(currency)!.unitsPerUsd)) : ''
                  }
                  placeholder="Sin tasa"
                />
              </Field>
            ))}
          </div>
          <div>
            <SubmitButton variant="outline">Guardar tasas</SubmitButton>
          </div>
        </ActionForm>
      </Card>
    </>
  );
}

interface Area {
  id: string;
  name: string;
  active: boolean;
  stops: Stop[];
}

function StopSelect({ id, areas }: { id: string; areas: Area[] }) {
  return (
    <Select id={id} name={id} required defaultValue="">
      <option value="">Elige la parada</option>
      {areas.map((area) => (
        <optgroup key={area.id} label={area.name}>
          {area.stops.map((s) => (
            <option key={s.id} value={s.id}>
              {s.city} · {s.name}
            </option>
          ))}
        </optgroup>
      ))}
    </Select>
  );
}
