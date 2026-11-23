import { TICKET_QR_PREFIX, type OfflineTicket } from '@vtp/shared-types';
import {
  EMPTY_OFFLINE,
  checkOffline,
  withBoarding,
  withList,
  withOnlineBoarding,
  withoutSent,
} from './offline-tickets';

const ANA = '6f1c2a3b-1d2e-4f50-8a9b-0c1d2e3f4a5b';
const ticket: OfflineTicket = {
  ticketId: ANA,
  tripId: 'trip-1',
  pin: '0427',
  bookingCode: 'VTP-7K3QXA',
  seatNumber: '3',
  passengerName: 'Ana Pérez',
  documentHint: 'V-•••5678',
  route: { id: 'r', name: 'El Triunfo – San Félix' },
  serviceDate: '2026-11-22',
  departsAt: '2026-11-22T00:00:00-04:00',
  arrivesAt: '2026-11-23T00:44:00-04:00',
  open: true,
  from: { id: 'a', kind: 'stop', name: 'El Triunfo', city: 'Casacoima', state: 'Delta Amacuro' },
  to: { id: 'b', kind: 'terminal', name: 'San Félix', city: 'San Félix', state: 'Bolívar' },
  boardedAt: null,
};
const saved = withList(EMPTY_OFFLINE, { generatedAt: '2026-11-22T10:00:00Z', tickets: [ticket] });
const noon = Date.parse('2026-11-22T12:00:00-04:00');

describe('checking tickets without signal', () => {
  it('lets on a paid ticket once, by QR or by code and seat', () => {
    const first = checkOffline(saved, { qr: `${TICKET_QR_PREFIX}${ANA}` }, noon)!;
    expect(first.validation).toMatchObject({
      result: 'boarded',
      passengerName: 'Ana Pérez',
      documentNumber: 'V-•••5678',
    });
    expect(first.boarding).toEqual({ ticketId: ANA, boardedAt: new Date(noon).toISOString() });
    const after = withBoarding(saved, first.boarding!);
    const again = checkOffline(after, { bookingCode: '7k3qxa', seatNumber: ' 3 ' }, noon + 60_000)!;
    expect(again.validation.result).toBe('already_boarded');
    expect(again.boarding).toBeNull();
  });

  it('applies the boarding window and knows tickets boarded before', () => {
    const tomorrow = Date.parse('2026-11-23T08:00:00-04:00');
    expect(
      checkOffline(saved, { qr: `${TICKET_QR_PREFIX}${ANA}` }, tomorrow)!.validation.result,
    ).toBe('other_departure');
    const used = withList(EMPTY_OFFLINE, {
      generatedAt: '2026-11-22T10:00:00Z',
      tickets: [{ ...ticket, boardedAt: '2026-11-22T13:00:00Z' }],
    });
    expect(checkOffline(used, { qr: `${TICKET_QR_PREFIX}${ANA}` }, noon)!.validation.result).toBe(
      'already_boarded',
    );
    const online = withOnlineBoarding(saved, ANA, '2026-11-22T15:00:00Z');
    expect(checkOffline(online, { qr: `${TICKET_QR_PREFIX}${ANA}` }, noon)!.validation.result).toBe(
      'already_boarded',
    );
  });

  it('finds a ticket by its PIN, only on its own departure', () => {
    const byPin = checkOffline(saved, { tripId: 'trip-1', pin: ' 04-27 ' }, noon)!;
    expect(byPin.validation.result).toBe('boarded');
    expect(checkOffline(saved, { tripId: 'trip-2', pin: '0427' }, noon)).toBeNull();
    expect(checkOffline(saved, { tripId: 'trip-1', pin: '427' }, noon)).toBeNull();
  });

  it('does not know tickets that are not on the list', () => {
    expect(checkOffline(saved, { qr: 'VTP1.otra-cosa' }, noon)).toBeNull();
    expect(checkOffline(EMPTY_OFFLINE, { qr: `${TICKET_QR_PREFIX}${ANA}` }, noon)).toBeNull();
  });

  it('sends what is pending and keeps it marked until a new list knows it', () => {
    const boarded = withBoarding(saved, { ticketId: ANA, boardedAt: '2026-11-22T16:00:00Z' });
    const relisted = withList(boarded, { generatedAt: '2026-11-22T16:05:00Z', tickets: [ticket] });
    expect(relisted.boardedHere).toEqual({ [ANA]: '2026-11-22T16:00:00Z' });
    const sent = withoutSent(relisted, [{ ticketId: ANA, result: 'boarded' }]);
    expect(sent.pending).toEqual([]);
    expect(withList(sent, { generatedAt: 'x', tickets: [] }).boardedHere).toEqual({});
  });
});
