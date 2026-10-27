import { compareAmounts, convert, fromScaled, toScaled } from './money.js';

const rates = new Map([
  ['VES', '36.5000'],
  ['BRL', '5.4321'],
] as const);

describe('money', () => {
  it('parses and prints fixed-point decimals', () => {
    expect(toScaled('36.5', 4)).toBe(365_000n);
    expect(toScaled('20', 2)).toBe(2_000n);
    expect(toScaled('1.50', 2)).toBe(150n);
    expect(toScaled('1.500', 2)).toBe(150n);
    expect(() => toScaled('1.505', 2)).toThrow(/decimals/);
    expect(() => toScaled('-1', 2)).toThrow();
    expect(fromScaled(5n, 2)).toBe('0.05');
    expect(fromScaled(123_456n, 2)).toBe('1234.56');
  });

  it('keeps amounts paid in the fare currency or its dollar equivalent', () => {
    expect(convert('40', 'VES', 'VES', rates)).toEqual({ amount: '40.00', rate: null });
    expect(convert('40.00', 'USD', 'USDT', rates)).toEqual({ amount: '40.00', rate: null });
  });

  it('converts through the dollar with the operator rates, rounding half up', () => {
    expect(convert('40.00', 'USD', 'VES', rates)).toEqual({ amount: '1460.00', rate: '36.500000' });
    expect(convert('35.00', 'USD', 'BRL', rates)).toEqual({ amount: '190.12', rate: '5.432100' });
    // 1000 Bs. / 36.5 = 27.3972… US$
    expect(convert('1000.00', 'VES', 'USDT', rates)).toEqual({
      amount: '27.40',
      rate: '0.027397',
    });
    // 1000 Bs. → 27.3972 US$ → 148.82 R$
    expect(convert('1000.00', 'VES', 'BRL', rates)?.amount).toBe('148.82');
  });

  it('returns null when a rate is missing', () => {
    expect(convert('40.00', 'USD', 'VES', new Map())).toBeNull();
    expect(convert('40.00', 'VES', 'USDT', new Map())).toBeNull();
  });

  it('compares amounts', () => {
    expect(compareAmounts('10.00', '10')).toBe(0);
    expect(compareAmounts('9.99', '10.00')).toBe(-1);
    expect(compareAmounts('10.01', '10.00')).toBe(1);
  });
});
