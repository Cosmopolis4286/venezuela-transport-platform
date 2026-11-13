import {
  formatMoney,
  networkClock,
  TAXI_DIRECTION_LABELS,
  TRANSPORT_MODE_LABELS,
  toNetworkIso,
  type TaxiRequest,
} from '@vtp/shared-types';

/**
 * Terminal rides: "Terminal La Bandera → Av. Bolívar…" (or the other way). Stretch rides (ADR-028):
 * "San Félix → Puerto Ordaz · buscar en Calle 3…".
 */
export function rideRoute(
  ride: Pick<TaxiRequest, 'kind' | 'direction' | 'terminal' | 'from' | 'to' | 'address'>,
): string {
  if (ride.kind === 'stretch' || !ride.terminal) {
    return `${ride.from?.city ?? '?'} → ${ride.to?.city ?? '?'} · buscar en ${ride.address}`;
  }
  return ride.direction === 'from_terminal'
    ? `${ride.terminal.name} → ${ride.address}`
    : `${ride.address} → ${ride.terminal.name}`;
}

/** "Desde el terminal · 2 pasajeros · hace 3 min", or "Moto · para el 12/11 06:30 · 1 pasajero". */
export function requestSummary(
  ride: Pick<
    TaxiRequest,
    'kind' | 'direction' | 'mode' | 'scheduledFor' | 'passengers' | 'requestedAt'
  >,
  now = Date.now(),
): string {
  const people = `${ride.passengers} ${ride.passengers === 1 ? 'pasajero' : 'pasajeros'}`;
  if (ride.scheduledFor) {
    const day = toNetworkIso(ride.scheduledFor);
    const when = `para el ${day.slice(8, 10)}/${day.slice(5, 7)} ${networkClock(ride.scheduledFor)}`;
    return `${TRANSPORT_MODE_LABELS[ride.mode]} · ${when} · ${people}`;
  }
  const minutes = Math.max(0, Math.floor((now - Date.parse(ride.requestedAt)) / 60_000));
  const ago = minutes < 1 ? 'recién pedido' : `hace ${minutes} min`;
  const what =
    ride.kind === 'stretch' || !ride.direction
      ? `${TRANSPORT_MODE_LABELS[ride.mode]} ahora`
      : TAXI_DIRECTION_LABELS[ride.direction];
  return `${what} · ${people} · ${ago}`;
}

/** Accepts `8`, `8.5`, `8,50`; returns the API's decimal string, or null when invalid or zero. */
export function parseFare(input: string): string | null {
  const value = input.trim().replace(',', '.');
  if (!/^\d{1,8}(\.\d{1,2})?$/.test(value) || Number(value) <= 0) return null;
  return Number(value).toFixed(2);
}

/**
 * Late-cancellation fees the passenger owes from earlier rides: the driver collects them in cash
 * on top of the fare (null when there are none).
 */
export function feesNotice(fees: TaxiRequest['feesDue']): string | null {
  if (!fees.length) return null;
  const sums = new Map<TaxiRequest['feesDue'][number]['currency'], number>();
  for (const f of fees) sums.set(f.currency, (sums.get(f.currency) ?? 0) + Number(f.amount));
  const total = [...sums].map(([c, n]) => formatMoney(n.toFixed(2), c)).join(' + ');
  return `Cobra además ${total} de una cancelación anterior del pasajero (en efectivo).`;
}
