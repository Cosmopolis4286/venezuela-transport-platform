import type { TaxiRequest } from '@vtp/shared-types';
import { parseFare, requestSummary, rideRoute } from './taxi-board';

const request = {
  direction: 'from_terminal',
  terminal: { name: 'Terminal La Bandera' },
  address: 'Av. Bolívar, Los Teques',
  passengers: 2,
  requestedAt: '2026-10-29T12:00:00.000Z',
} as TaxiRequest;

describe('taxi board labels', () => {
  it('shows the route in the direction of travel', () => {
    expect(rideRoute(request)).toBe('Terminal La Bandera → Av. Bolívar, Los Teques');
    expect(rideRoute({ ...request, direction: 'to_terminal' })).toBe(
      'Av. Bolívar, Los Teques → Terminal La Bandera',
    );
  });

  it('summarizes the request', () => {
    const now = Date.parse('2026-10-29T12:03:30.000Z');
    expect(requestSummary(request, now)).toBe('Desde el terminal · 2 pasajeros · hace 3 min');
    expect(requestSummary({ ...request, passengers: 1 }, Date.parse(request.requestedAt))).toBe(
      'Desde el terminal · 1 pasajero · recién pedido',
    );
  });

  it('parses fares typed by drivers', () => {
    expect(parseFare('8')).toBe('8.00');
    expect(parseFare('8,5')).toBe('8.50');
    expect(parseFare(' 120.25 ')).toBe('120.25');
    expect(parseFare('0')).toBeNull();
    expect(parseFare('8.555')).toBeNull();
    expect(parseFare('ocho')).toBeNull();
  });
});
