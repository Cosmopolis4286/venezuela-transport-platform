import { WAIT_AT_STOP_MINUTES, type DriverManifest } from '@vtp/shared-types';

type Passenger = DriverManifest['passengers'][number];

export interface PickupStop {
  stop: DriverManifest['stops'][number];
  /** Paid and still to board here. */
  waiting: Passenger[];
  /** Already on board (boarded here). */
  boarded: Passenger[];
  /** Held but not paid yet: shown apart, they may not come. */
  unpaid: Passenger[];
  /** How many get off here. */
  alighting: number;
}

/**
 * The pickup list "de adentro hacia afuera" (ADR-052): stop by stop in the route's order, only
 * the stops where somebody boards or gets off.
 */
export function pickupList(manifest: Pick<DriverManifest, 'stops' | 'passengers'>): PickupStop[] {
  // A trip saved on the phone by an older version has no stops: the passengers' own, in order.
  const stops: DriverManifest['stops'] = manifest.stops?.length
    ? manifest.stops
    : [
        ...new Map(
          manifest.passengers
            .flatMap((p) => [p.from, p.to])
            .map((stop) => [stop.id, { ...stop, arrivedAt: null }]),
        ).values(),
      ];
  return stops
    .map((stop) => {
      const here = manifest.passengers.filter((p) => p.from.id === stop.id);
      return {
        stop,
        waiting: here.filter((p) => p.bookingStatus === 'confirmed' && !p.boardedAt),
        boarded: here.filter((p) => p.boardedAt),
        unpaid: here.filter((p) => p.bookingStatus !== 'confirmed' && !p.boardedAt),
        alighting: manifest.passengers.filter((p) => p.to.id === stop.id).length,
      };
    })
    .filter((s) => s.waiting.length + s.boarded.length + s.unpaid.length + s.alighting > 0);
}

/** Seconds left of the wait at a stop the driver reached at `arrivedAt` (0 when it ran out). */
export function waitLeft(arrivedAt: string, now: number): number {
  const end = Date.parse(arrivedAt) + WAIT_AT_STOP_MINUTES * 60_000;
  return Math.max(0, Math.ceil((end - now) / 1000));
}

/** "1:05". */
export const clock = (seconds: number) =>
  `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
