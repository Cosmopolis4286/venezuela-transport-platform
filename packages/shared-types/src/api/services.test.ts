import { describe, expect, it } from 'vitest';
import { cityIn, openServices, serviceOpen, type ServicesStatus } from './services.js';

const status = (overrides: Partial<ServicesStatus['intercity']> = {}, areaIds: string[] = []) =>
  ({
    intercity: { enabled: true, closedCities: [], ...overrides },
    suburban: {
      enabled: areaIds.length > 0,
      areas: areaIds.map((id) => ({ id, name: id, active: true, stops: [] })),
    },
  }) satisfies ServicesStatus;

const caracas = { city: 'Caracas', state: 'Distrito Capital' };
const ordaz = { city: 'Puerto Ordaz', state: 'Bolívar' };

describe('serviceOpen', () => {
  it('sells intercity unless it is off or a city of the trip is closed', () => {
    const trip = { service: 'intercity' as const, serviceAreaId: null, from: caracas, to: ordaz };
    expect(serviceOpen(status(), trip)).toBe(true);
    expect(serviceOpen(status({ enabled: false }), trip)).toBe(false);
    expect(
      serviceOpen(status({ closedCities: [{ city: ' puerto ordaz', state: 'BOLÍVAR ' }] }), trip),
    ).toBe(false);
  });

  it('sells suburban only in active corridors, whatever intercity does', () => {
    const trip = { service: 'suburban' as const, serviceAreaId: 'a', from: ordaz, to: ordaz };
    expect(serviceOpen(status({ enabled: false }, ['a']), trip)).toBe(true);
    expect(serviceOpen(status({}, ['b']), trip)).toBe(false);
  });
});

describe('openServices', () => {
  it('lists what passengers can choose', () => {
    expect(openServices(status())).toEqual(['intercity']);
    expect(openServices(status({}, ['a']))).toEqual(['intercity', 'suburban']);
    expect(openServices(status({ enabled: false }, ['a']))).toEqual(['suburban']);
  });

  it('compares cities ignoring case and spaces', () => {
    expect(cityIn([caracas], { city: 'CARACAS ', state: 'distrito capital' })).toBe(true);
  });
});
