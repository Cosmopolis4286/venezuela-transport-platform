import { describe, expect, it } from 'vitest';
import type { AssistedTaxiRide } from '@vtp/shared-types';
import { customerMessage, customerWhatsappLink } from './taxi-whatsapp';

const url = 'https://example.com/es/taxi/abc';
const assisted = {
  customer: { name: 'Carmen', phone: '+584165551234' },
  trackingPath: '/taxi/abc',
  ride: {
    status: 'requested',
    vehicleType: 'moto',
    vehicle: null,
    driver: null,
    fare: null,
  },
} as unknown as AssistedTaxiRide;

describe('WhatsApp messages for taxis asked by chat', () => {
  it('sends the tracking link first, then the plate, then the rating link', () => {
    expect(customerMessage(assisted, url)).toBe(
      `Hola Carmen, ya pedimos tu mototaxi. Te avisamos cuando un conductor lo tome. Puedes seguirlo aquí: ${url}`,
    );
    const accepted = {
      ...assisted,
      ride: {
        ...assisted.ride,
        status: 'accepted',
        vehicle: { plate: 'MT001AA', label: null },
        driver: { firstName: 'Luis', lastName: 'Pérez', phone: null },
        fare: { amount: '2', currency: 'USD' },
      },
    } as AssistedTaxiRide;
    expect(customerMessage(accepted, url)).toContain(
      'va en camino: placa MT001AA, conductor Luis, tarifa US$ 2,00.',
    );
    const done = {
      ...assisted,
      ride: { ...assisted.ride, status: 'completed' },
    } as AssistedTaxiRide;
    expect(customerMessage(done, url)).toContain(
      `Califica el viaje aquí (1 a 5 estrellas): ${url}`,
    );
  });

  it('opens a chat with the customer, message typed', () => {
    expect(customerWhatsappLink(assisted, url)).toMatch(
      /^https:\/\/wa\.me\/584165551234\?text=Hola/,
    );
    expect(
      customerWhatsappLink({ ...assisted, customer: { name: 'X', phone: '12' } }, url),
    ).toBeNull();
  });
});
