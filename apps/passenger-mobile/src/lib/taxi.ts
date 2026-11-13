import {
  OPEN_TAXI_RIDE_STATUSES,
  localPhone,
  type TaxiDirection,
  type TaxiRide,
  type TransportMode,
} from '@vtp/shared-types';

/** The ride still needs something to happen (waiting, assigned or on the way). */
export function isOpenRide(ride: Pick<TaxiRide, 'status'>): boolean {
  return (OPEN_TAXI_RIDE_STATUSES as readonly string[]).includes(ride.status);
}

/** "Carlos Pérez · 0414-1234567", or what is known about the driver (`fallback` if unnamed). */
export function driverLine(driver: TaxiRide['driver'], fallback = 'Conductor'): string | null {
  if (!driver) return null;
  const name = [driver.firstName, driver.lastName].filter(Boolean).join(' ') || fallback;
  return driver.phone ? `${name} · ${localPhone(driver.phone)}` : name;
}

/**
 * Where a ride goes, in one line: "Desde el terminal · Terminal La Bandera" or, for a stretch
 * ride, "Moto · San Félix → Puerto Ordaz".
 */
export function ridePlace(
  ride: Pick<TaxiRide, 'kind' | 'direction' | 'terminal' | 'from' | 'to' | 'mode'>,
  t: { ride: { stretch: (from: string, to: string) => string } },
  shared: {
    taxiDirection: Record<TaxiDirection, string>;
    transportMode: Record<TransportMode, string>;
  },
): string {
  if (ride.kind === 'stretch' || !ride.terminal || !ride.direction) {
    return `${shared.transportMode[ride.mode]} · ${t.ride.stretch(ride.from?.city ?? '', ride.to?.city ?? '')}`;
  }
  return `${shared.taxiDirection[ride.direction]} · ${ride.terminal.name}`;
}
