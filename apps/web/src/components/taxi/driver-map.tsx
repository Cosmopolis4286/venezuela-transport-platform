import type { PublicTaxiRide } from '@vtp/shared-types';

/** The driver's last location in a maps app, while the ride is open (ADR-041, ADR-043). */
export function DriverMap({ ride, label }: { ride: PublicTaxiRide; label: string }) {
  if (!ride.driverLocation) return null;
  const { latitude, longitude } = ride.driverLocation;
  return (
    <a
      href={`https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`}
      target="_blank"
      rel="noreferrer"
      className="text-sm underline"
    >
      {label}
    </a>
  );
}
