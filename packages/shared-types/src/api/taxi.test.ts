import { describe, expect, it } from 'vitest';
import { localPhone, taxiRideHint, taxiRideRoute } from './taxi.js';

describe('taxi helpers', () => {
  it('shows the route in the direction of travel', () => {
    const ride = { terminal: { name: 'Terminal' }, address: 'Calle Bolívar', destination: null };
    expect(taxiRideRoute({ ...ride, direction: 'from_terminal' })).toBe('Terminal → Calle Bolívar');
    expect(taxiRideRoute({ ...ride, direction: 'to_terminal' })).toBe('Calle Bolívar → Terminal');
    expect(taxiRideRoute({ ...ride, direction: 'local', destination: 'Ambulatorio' })).toBe(
      'Calle Bolívar → Ambulatorio',
    );
  });

  it('writes Venezuelan phones the local way', () => {
    expect(localPhone('+584141234567')).toBe('0414-1234567');
    expect(localPhone('+15551234567')).toBe('+15551234567');
  });

  it('tells the passenger what happens next', () => {
    expect(taxiRideHint({ status: 'accepted', direction: 'from_terminal' })).toMatch(/terminal/);
    expect(taxiRideHint({ status: 'accepted', direction: 'to_terminal' })).toMatch(/dirección/);
    expect(taxiRideHint({ status: 'expired', direction: 'to_terminal' })).toMatch(/otro/);
  });
});
