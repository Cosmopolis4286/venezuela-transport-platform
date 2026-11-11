import type { TaxiRequest } from '@vtp/shared-types';
import { parseFare, requestSummary, rideRoute } from './taxi-board';

const request = {
  kind: 'terminal',
  mode: 'car',
  scheduledFor: null,
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

  it('shows stretch rides with their stops, vehicle and time', () => {
    const stretch = {
      ...request,
      kind: 'stretch',
      direction: null,
      terminal: null,
      from: { city: 'San Félix' },
      to: { city: 'Puerto Ordaz' },
      mode: 'motorcycle',
      passengers: 1,
    } as unknown as TaxiRequest;
    expect(rideRoute(stretch)).toBe('San Félix → Puerto Ordaz · buscar en Av. Bolívar, Los Teques');
    expect(requestSummary(stretch, Date.parse(request.requestedAt))).toBe(
      'Moto ahora · 1 pasajero · recién pedido',
    );
    expect(requestSummary({ ...stretch, scheduledFor: '2026-11-12T10:30:00.000Z' })).toBe(
      'Moto · para el 12/11 06:30 · 1 pasajero',
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
