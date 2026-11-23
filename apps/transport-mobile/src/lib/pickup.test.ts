import type { DriverManifest } from '@vtp/shared-types';
import { clock, pickupList, waitLeft } from './pickup';

const stop = (id: string) =>
  ({
    id,
    kind: 'stop',
    name: id,
    city: 'Casacoima',
    state: 'Delta Amacuro',
    arrivedAt: null,
  }) as DriverManifest['stops'][number];
const passenger = (
  seatNumber: string,
  from: string,
  to: string,
  extra: Partial<DriverManifest['passengers'][number]> = {},
) =>
  ({
    seatNumber,
    firstName: seatNumber,
    lastName: '',
    bookingStatus: 'confirmed',
    from: stop(from),
    to: stop(to),
    boardedAt: null,
    ...extra,
  }) as DriverManifest['passengers'][number];

describe('pickup list', () => {
  it('goes stop by stop in the route order, skipping empty stops', () => {
    const list = pickupList({
      stops: [stop('adentro'), stop('medio'), stop('salida'), stop('san-felix')],
      passengers: [
        passenger('3', 'salida', 'san-felix'),
        passenger('1', 'adentro', 'san-felix', { boardedAt: '2026-11-23T09:00:00Z' }),
        passenger('2', 'adentro', 'san-felix'),
        passenger('4', 'adentro', 'san-felix', { bookingStatus: 'held' }),
      ],
    });
    expect(list.map((s) => s.stop.id)).toEqual(['adentro', 'salida', 'san-felix']);
    expect(list[0]!.waiting.map((p) => p.seatNumber)).toEqual(['2']);
    expect(list[0]!.boarded.map((p) => p.seatNumber)).toEqual(['1']);
    expect(list[0]!.unpaid.map((p) => p.seatNumber)).toEqual(['4']);
    expect(list[2]!.alighting).toBe(4);
  });

  it('still lists the passengers of a trip saved without stops', () => {
    const list = pickupList({
      stops: undefined as unknown as DriverManifest['stops'],
      passengers: [passenger('1', 'adentro', 'san-felix')],
    });
    expect(list.map((s) => s.stop.id)).toEqual(['adentro', 'san-felix']);
  });

  it('counts down the 2 minutes of wait', () => {
    const at = '2026-11-23T10:00:00.000Z';
    expect(waitLeft(at, Date.parse(at))).toBe(120);
    expect(waitLeft(at, Date.parse(at) + 55_500)).toBe(65);
    expect(waitLeft(at, Date.parse(at) + 200_000)).toBe(0);
    expect(clock(65)).toBe('1:05');
  });
});
