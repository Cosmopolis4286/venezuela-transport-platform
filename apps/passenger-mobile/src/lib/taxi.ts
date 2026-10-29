import { OPEN_TAXI_RIDE_STATUSES, localPhone, type TaxiRide } from '@vtp/shared-types';

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
