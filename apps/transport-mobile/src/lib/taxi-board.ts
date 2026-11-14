import {
  TAXI_DIRECTION_LABELS,
  TAXI_VEHICLE_TYPE_LABELS,
  taxiRideRoute,
  type TaxiRequest,
} from '@vtp/shared-types';

/** "Terminal La Bandera → Av. Bolívar…", "Av. Bolívar… → Terminal…" or "Calle… → Ambulatorio". */
export const rideRoute = taxiRideRoute;

/** "Mototaxi · Desde el terminal · 1 pasajero · hace 3 min". */
export function requestSummary(
  ride: Pick<TaxiRequest, 'direction' | 'passengers' | 'requestedAt' | 'vehicleType'>,
  now = Date.now(),
): string {
  const minutes = Math.max(0, Math.floor((now - Date.parse(ride.requestedAt)) / 60_000));
  const ago = minutes < 1 ? 'recién pedido' : `hace ${minutes} min`;
  const people = `${ride.passengers} ${ride.passengers === 1 ? 'pasajero' : 'pasajeros'}`;
  return `${TAXI_VEHICLE_TYPE_LABELS[ride.vehicleType]} · ${TAXI_DIRECTION_LABELS[ride.direction]} · ${people} · ${ago}`;
}

/** Accepts `8`, `8.5`, `8,50`; returns the API's decimal string, or null when invalid or zero. */
export function parseFare(input: string): string | null {
  const value = input.trim().replace(',', '.');
  if (!/^\d{1,8}(\.\d{1,2})?$/.test(value) || Number(value) <= 0) return null;
  return Number(value).toFixed(2);
}
