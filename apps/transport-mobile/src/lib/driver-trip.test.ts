import type { DriverTrip } from '@vtp/shared-types';
import { tripHours, tripLoad, tripWhen } from './driver-trip';

const trip = {
  departsAt: '2026-10-29T20:00:00-04:00',
  arrivesAt: '2026-10-30T06:00:00-04:00',
  soldSeats: 10,
  heldSeats: 2,
  capacity: 30,
  vehicle: { id: 'v', plate: 'AB123CD', label: 'Unidad 12' },
} as DriverTrip;

describe('driver trip labels', () => {
  it('shows hours with the day offset', () => {
    expect(tripHours(trip)).toBe('20:00 → 06:00 (+1)');
    expect(tripHours({ ...trip, arrivesAt: '2026-10-29T23:00:00-04:00' })).toBe('20:00 → 23:00');
    expect(tripWhen(trip)).toBe('Jueves, 29 de octubre · 20:00 → 06:00 (+1)');
  });

  it('shows the vehicle and the occupied seats', () => {
    expect(tripLoad(trip)).toBe('Vehículo AB123CD · Unidad 12 · 12 de 30 puestos ocupados');
    expect(tripLoad({ ...trip, vehicle: null })).toBe(
      'Sin vehículo asignado · 12 de 30 puestos ocupados',
    );
  });
});
