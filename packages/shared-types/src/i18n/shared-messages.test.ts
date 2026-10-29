import { describe, expect, it } from 'vitest';
import { formatMoney, longDate } from '../api/network.js';
import { formatPaymentAmount } from '../api/payments.js';
import { taxiRideHint } from '../api/taxi.js';
import { LOCALES } from './locales.js';
import { apiErrorText, SHARED_MESSAGES } from './shared-messages.js';

describe('shared messages', () => {
  it('translates every text into every language', () => {
    const keys = (value: unknown, prefix = ''): string[] =>
      typeof value === 'object' && value !== null
        ? Object.entries(value).flatMap(([k, v]) => keys(v, `${prefix}${k}.`))
        : [prefix];
    const spanish = keys(SHARED_MESSAGES.es).sort();
    for (const locale of LOCALES) {
      expect(keys(SHARED_MESSAGES[locale]).sort()).toEqual(spanish);
      for (const path of keys(SHARED_MESSAGES[locale])) {
        const text = path
          .split('.')
          .filter(Boolean)
          .reduce<unknown>(
            (node, k) => (node as Record<string, unknown>)[k],
            SHARED_MESSAGES[locale],
          );
        expect(typeof text === 'string' && text.trim().length > 0, `${locale} ${path}`).toBe(true);
      }
    }
  });

  it('picks the reason, then the code, then the API text', () => {
    expect(apiErrorText('en', { code: 'CONFLICT', reason: 'SEAT_TAKEN', message: 'x' })).toMatch(
      /Someone just held/,
    );
    expect(apiErrorText('pt-BR', { code: 'INVALID_CREDENTIALS' })).toBe(
      'E-mail ou senha incorretos.',
    );
    expect(apiErrorText('es', { code: 'NETWORK' })).toMatch(/No pudimos conectar/);
    expect(apiErrorText('en', { code: 'CONFLICT', message: 'Route has no fare' })).toBe(
      'Route has no fare',
    );
    expect(apiErrorText('pt-BR', {})).toBe('Ocorreu um erro inesperado. Tente novamente.');
  });

  it('formats dates, money and hints in each language', () => {
    expect(longDate('2026-10-20', 'en')).toBe('Tuesday, October 20');
    expect(longDate('2026-10-20', 'pt-BR')).toBe('terça-feira, 20 de outubro');
    expect(longDate('2026-10-20')).toBe('martes, 20 de octubre');
    expect(formatMoney('1234.5', 'USD', 'en')).toBe('US$ 1,234.50');
    expect(formatMoney('1234.5', 'VES')).toBe('Bs. 1.234,50');
    expect(formatPaymentAmount('175', 'BRL', 'pt-BR')).toBe('R$ 175,00');
    expect(taxiRideHint({ status: 'accepted', direction: 'to_terminal' }, 'en')).toMatch(
      /address you gave/,
    );
  });
});
