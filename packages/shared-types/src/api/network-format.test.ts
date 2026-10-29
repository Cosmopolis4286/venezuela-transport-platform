import { describe, expect, it } from 'vitest';
import {
  daysBetween,
  formatMoney,
  localTime,
  longDate,
  networkClock,
  todayInVenezuela,
  toNetworkIso,
} from './network.js';

describe('travel formatting', () => {
  it('reads local times and day changes from offset timestamps', () => {
    expect(localTime('2026-10-20T21:30:00-04:00')).toBe('21:30');
    expect(daysBetween('2026-10-20T21:30:00-04:00', '2026-10-21T07:30:00-04:00')).toBe(1);
    expect(daysBetween('2026-12-31', '2027-01-01T05:00:00-04:00')).toBe(1);
  });

  it('converts instants to Venezuelan time, across midnight', () => {
    expect(toNetworkIso('2026-10-21T01:30:00.000Z')).toBe('2026-10-20T21:30:00-04:00');
    expect(toNetworkIso(new Date('2026-10-21T04:00:00Z'))).toBe('2026-10-21T00:00:00-04:00');
    expect(networkClock('2026-10-28T01:05:00.000Z')).toBe('21:05');
    expect(todayInVenezuela(new Date('2026-10-21T03:59:00Z'))).toBe('2026-10-20');
    expect(todayInVenezuela(new Date('2026-10-21T04:00:00Z'))).toBe('2026-10-21');
  });

  it('formats Venezuelan dates and both currencies', () => {
    expect(longDate('2026-10-20')).toBe('martes, 20 de octubre');
    expect(formatMoney('35', 'USD')).toBe('US$ 35,00');
    expect(formatMoney('1250.5', 'VES')).toBe('Bs. 1.250,50');
  });

  it('uses Caracas time for today', () => {
    expect(todayInVenezuela(new Date('2026-10-20T03:59:00Z'))).toBe('2026-10-19');
  });
});
