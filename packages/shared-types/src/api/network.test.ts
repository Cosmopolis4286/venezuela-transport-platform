import { describe, expect, it } from 'vitest';
import {
  formatDuration,
  isTimeOfDay,
  modesFor,
  runsRoutes,
  seriesTimes,
  servicesFor,
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

describe('modesFor', () => {
  it('gives each route operator at least one mode and terminals none', () => {
    expect(modesFor('bus_company')).toEqual(['bus']);
    expect(modesFor('taxi_line')).toEqual(['car']);
    expect(modesFor('terminal')).toEqual([]);
  });
});

describe('servicesFor', () => {
  it('lets motorcycle taxi lines publish only suburban routes, with motorcycles', () => {
    expect(servicesFor('moto_line')).toEqual(['suburban']);
    expect(modesFor('moto_line')).toEqual(['motorcycle']);
    expect(servicesFor('bus_company')).toEqual(['intercity', 'suburban']);
    expect(servicesFor('terminal')).toEqual([]);
  });
});

describe('seriesTimes', () => {
  it('lists every departure from the first to the last allowed time', () => {
    expect(seriesTimes('05:00', '06:00', 20)).toEqual(['05:00', '05:20', '05:40', '06:00']);
    expect(seriesTimes('05:00', '05:50', 20)).toEqual(['05:00', '05:20', '05:40']);
    expect(seriesTimes('22:00', '21:00', 15)).toEqual([]);
  });
});
