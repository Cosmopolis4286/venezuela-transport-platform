import { normalizeRate, splitFare } from './ledger.js';

describe('splitFare', () => {
  it('takes no commission at 0 %', () => {
    expect(splitFare('40.00', '0')).toEqual({ commission: '0.00', earned: '40.00' });
  });

  it('applies whole and fractional percentages', () => {
    expect(splitFare('40.00', '10')).toEqual({ commission: '4.00', earned: '36.00' });
    expect(splitFare('1460.00', '8.5')).toEqual({ commission: '124.10', earned: '1335.90' });
  });

  it('rounds the commission half up to cents', () => {
    // 0.25 × 10 % = 0.025 → 0.03
    expect(splitFare('0.25', '10')).toEqual({ commission: '0.03', earned: '0.22' });
    // 0.24 × 10 % = 0.024 → 0.02
    expect(splitFare('0.24', '10')).toEqual({ commission: '0.02', earned: '0.22' });
  });

  it('keeps everything at 100 %', () => {
    expect(splitFare('35.50', '100')).toEqual({ commission: '35.50', earned: '0.00' });
  });
});

describe('normalizeRate', () => {
  it('formats with two decimals', () => {
    expect(normalizeRate('8.5')).toBe('8.50');
    expect(normalizeRate('0')).toBe('0.00');
    expect(normalizeRate('100')).toBe('100.00');
  });
});
