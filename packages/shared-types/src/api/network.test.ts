import { describe, expect, it } from 'vitest';
import { formatDuration, isTimeOfDay, runsRoutes } from './network.js';
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
