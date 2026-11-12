import { describe, expect, it } from 'vitest';
import {
  formatDuration,
  frequencyRuns,
  isTimeOfDay,
  runsRoutes,
  withServiceFee,
} from './network.js';
import { roleHasPermission } from './organizations.js';

describe('network helpers', () => {
  it('validates 24-hour times of day', () => {
    expect(isTimeOfDay('00:00')).toBe(true);
    expect(isTimeOfDay('23:59')).toBe(true);
    expect(isTimeOfDay('24:00')).toBe(false);
    expect(isTimeOfDay('8:30')).toBe(false);
  });

  it('formats durations', () => {
    expect(formatDuration(45)).toBe('45 min');
    expect(formatDuration(120)).toBe('2 h');
    expect(formatDuration(510)).toBe('8 h 30 min');
  });

  it('lets bus companies and taxi lines run routes, managed by owners and admins', () => {
    expect(runsRoutes('bus_company')).toBe(true);
    expect(runsRoutes('taxi_line')).toBe(true);
    expect(runsRoutes('terminal')).toBe(false);
    expect(roleHasPermission('admin', 'routes.manage')).toBe(true);
    expect(roleHasPermission('dispatcher', 'routes.manage')).toBe(false);
  });
});

describe('withServiceFee', () => {
  it('adds the fee on top, rounded half up to cents', () => {
    expect(withServiceFee('0.75', '15.00')).toEqual({ fee: '0.11', total: '0.86' });
    expect(withServiceFee('25.00', '15.00')).toEqual({ fee: '3.75', total: '28.75' });
    expect(withServiceFee('10.10', '0.00')).toEqual({ fee: '0.00', total: '10.10' });
    expect(withServiceFee('0.10', '5.00')).toEqual({ fee: '0.01', total: '0.11' });
  });
});

describe('frequencyRuns', () => {
  it('counts the units of a frequency schedule, 1 for a single departure', () => {
    expect(frequencyRuns('05:00', '20:00', 15)).toBe(61);
    expect(frequencyRuns('05:00', '05:10', 15)).toBe(1);
    expect(frequencyRuns('06:00', null, null)).toBe(1);
    expect(frequencyRuns('20:00', '05:00', 15)).toBe(1);
  });
});
