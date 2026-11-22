import type { DriverApproach } from '@vtp/shared-types';

/** The web build has no native map: the ride screen keeps its "View on the map" link. */
export function DriverMap(_: {
  approach: DriverApproach;
  driverLabel: string;
  pickupLabel: string;
}) {
  return null;
}
