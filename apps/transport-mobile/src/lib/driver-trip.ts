import { daysBetween, localTime, longDate, vehicleName, type DriverTrip } from '@vtp/shared-types';

/** "08:00 → 18:00", with "(+1)" when the trip arrives on a later day. */
export function tripHours(trip: Pick<DriverTrip, 'departsAt' | 'arrivesAt'>): string {
  const days = daysBetween(trip.departsAt, trip.arrivesAt);
  return `${localTime(trip.departsAt)} → ${localTime(trip.arrivesAt)}${days > 0 ? ` (+${days})` : ''}`;
}

/** "Jueves, 29 de octubre · 08:00 → 18:00". */
export function tripWhen(trip: Pick<DriverTrip, 'departsAt' | 'arrivesAt'>): string {
  const date = longDate(trip.departsAt);
  return `${date.charAt(0).toUpperCase()}${date.slice(1)} · ${tripHours(trip)}`;
}

/** "Vehículo AB123CD · Unidad 12 · 12 de 30 puestos ocupados". */
export function tripLoad(trip: DriverTrip): string {
  const vehicle = trip.vehicle ? `Vehículo ${vehicleName(trip.vehicle)}` : 'Sin vehículo asignado';
  return `${vehicle} · ${trip.soldSeats + trip.heldSeats} de ${trip.capacity} puestos ocupados`;
}
