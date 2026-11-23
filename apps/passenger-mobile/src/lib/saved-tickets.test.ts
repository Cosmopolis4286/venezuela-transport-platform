import type { Booking } from '@vtp/shared-types';
import {
  KEEP_AFTER_TRIP_MS,
  NO_SAVED_TICKETS,
  toSaved,
  withBooking,
  withList,
  withoutEnded,
} from './saved-tickets';

const NOW = Date.parse('2026-11-22T12:00:00Z');
const hours = (n: number) => new Date(NOW + n * 3600_000).toISOString();

function booking(overrides: Partial<Booking> = {}, trip: Partial<Booking['trip']> = {}): Booking {
  return {
    id: 'b1',
    code: 'VTP-AAA111',
    status: 'confirmed',
    trip: {
      id: 't1',
      scheduleId: 's1',
      serviceDate: '2026-11-22',
      departsAt: hours(2),
      arrivesAt: hours(5),
      serviceClass: 'standard',
      cancellation: null,
      headwayMinutes: null,
      ...trip,
    },
    operator: { id: 'o1', type: 'bus_company', legalName: 'Expresos C.A.', tradeName: 'Expresos' },
    route: { id: 'r1', name: 'Tucupita - El Triunfo' },
    from: { city: 'Tucupita' },
    to: { city: 'El Triunfo' },
    passengers: [
      {
        firstName: 'Ana',
        lastName: 'Pérez',
        documentType: 'V',
        documentNumber: '12345678',
        seatNumber: '3',
        fare: '5.00',
        ticket: { qr: 'vtp:ticket:1', pin: '0427', boardedAt: null },
      },
    ],
    ...overrides,
  } as unknown as Booking;
}

describe('saved tickets', () => {
  it('keeps confirmed bookings with tickets, soonest first', () => {
    const later = booking({ id: 'b2' }, { departsAt: hours(30), arrivesAt: hours(33) });
    const saved = toSaved([later, booking()], NOW);
    expect(saved.map((b) => b.id)).toEqual(['b1', 'b2']);
    expect(saved[0]).toMatchObject({
      code: 'VTP-AAA111',
      operator: 'Expresos',
      from: 'Tucupita',
      to: 'El Triunfo',
      open: false,
      passengers: [
        {
          seatNumber: '3',
          name: 'Ana Pérez',
          document: 'V-12345678',
          qr: 'vtp:ticket:1',
          pin: '0427',
        },
      ],
    });
  });

  it('skips unpaid, cancelled and long-over trips', () => {
    const saved = toSaved(
      [
        booking({ id: 'held', status: 'held' }),
        booking({ id: 'cancelled' }, { cancellation: { reason: 'lluvia' } }),
        booking({ id: 'old' }, { departsAt: hours(-60), arrivesAt: hours(-50) }),
      ],
      NOW,
    );
    expect(saved).toEqual([]);
  });

  it('replaces the list for the account and drops one that stopped being paid', () => {
    const list = withList('u1', [booking()], NOW);
    expect(list.userId).toBe('u1');
    expect(list.bookings).toHaveLength(1);
    const after = withBooking(list, 'u1', booking({ status: 'cancelled' }), NOW);
    expect(after.bookings).toEqual([]);
  });

  it('never mixes accounts', () => {
    const list = withList('u1', [booking()], NOW);
    expect(withBooking(list, 'u2', booking({ id: 'b9' }), NOW)).toBe(list);
    expect(withBooking(NO_SAVED_TICKETS, 'u2', booking(), NOW).userId).toBe('u2');
  });

  it('deletes trips two days after they end', () => {
    const list = withList('u1', [booking()], NOW);
    const ends = Date.parse(list.bookings[0]!.arrivesAt);
    expect(withoutEnded(list, ends + KEEP_AFTER_TRIP_MS - 1)).toBe(list);
    expect(withoutEnded(list, ends + KEEP_AFTER_TRIP_MS).bookings).toEqual([]);
  });
});
