import { normalizeRate, percentOf, splitFare, splitRefund } from './ledger.js';

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

describe('percentOf', () => {
  it('rounds half up to cents', () => {
    expect(percentOf('100.00', 50)).toBe('50.00');
    expect(percentOf('0.05', 50)).toBe('0.03');
    expect(percentOf('3650.00', 100)).toBe('3650.00');
    expect(percentOf('3650.00', 0)).toBe('0.00');
  });
});

describe('splitRefund', () => {
  it('takes a partial refund from what the operator earned; the platform keeps its commission', () => {
    // US$ 100 at 8 %: operator earned 92. A 50 % refund leaves it 42; the platform keeps 8.
    expect(splitRefund('50.00', '92.00')).toEqual({ fromEarned: '50.00', fromCommission: '0.00' });
  });

  it('takes a full refund from the commission too, never leaving the operator below zero', () => {
    expect(splitRefund('100.00', '92.00')).toEqual({
      fromEarned: '92.00',
      fromCommission: '8.00',
    });
  });
});
