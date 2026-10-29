import { describe, expect, it } from 'vitest';
import { localPhone, taxiRideHint } from './taxi.js';

describe('taxi helpers', () => {
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
