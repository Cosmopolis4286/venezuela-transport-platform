import { describe, expect, it } from 'vitest';
import {
  COMMISSION_PATTERN,
  DEFAULT_REFUND_TIERS,
  refundPercentFor,
  refundTiersProblem,
} from './settlements.js';

describe('refundPercentFor', () => {
  it('applies the default tiers: 100 % from 48 h, 50 % from 2 h, nothing after', () => {
    expect(refundPercentFor(DEFAULT_REFUND_TIERS, 72)).toBe(100);
    expect(refundPercentFor(DEFAULT_REFUND_TIERS, 48)).toBe(100);
    expect(refundPercentFor(DEFAULT_REFUND_TIERS, 47.9)).toBe(50);
    expect(refundPercentFor(DEFAULT_REFUND_TIERS, 2)).toBe(50);
    expect(refundPercentFor(DEFAULT_REFUND_TIERS, 1.5)).toBe(0);
  });

  it('refunds nothing once the bus left, even with a 0 h tier', () => {
    expect(refundPercentFor([{ hoursBefore: 0, percent: 80 }], 0.1)).toBe(80);
    expect(refundPercentFor([{ hoursBefore: 0, percent: 80 }], 0)).toBe(0);
    expect(refundPercentFor([{ hoursBefore: 0, percent: 80 }], -3)).toBe(0);
  });
});

describe('refundTiersProblem', () => {
  it('accepts the defaults', () => {
    expect(refundTiersProblem(DEFAULT_REFUND_TIERS)).toBeNull();
  });

  it('rejects empty, too many, unordered or out-of-range tiers', () => {
    expect(refundTiersProblem([])).not.toBeNull();
    expect(
      refundTiersProblem([
        { hoursBefore: 96, percent: 100 },
        { hoursBefore: 48, percent: 80 },
        { hoursBefore: 24, percent: 50 },
        { hoursBefore: 6, percent: 25 },
        { hoursBefore: 1, percent: 10 },
      ]),
    ).not.toBeNull();
    expect(
      refundTiersProblem([
        { hoursBefore: 2, percent: 50 },
        { hoursBefore: 48, percent: 100 },
      ]),
    ).not.toBeNull();
    expect(refundTiersProblem([{ hoursBefore: 24, percent: 101 }])).not.toBeNull();
    expect(refundTiersProblem([{ hoursBefore: 1.5, percent: 50 }])).not.toBeNull();
    expect(refundTiersProblem([{ hoursBefore: 800, percent: 50 }])).not.toBeNull();
  });
});

describe('COMMISSION_PATTERN', () => {
  it('accepts 0–100 with up to two decimals', () => {
    for (const ok of ['0', '8', '8.5', '8.50', '99.99', '100', '100.00']) {
      expect(COMMISSION_PATTERN.test(ok)).toBe(true);
    }
    for (const bad of ['101', '8.555', '-1', '100.01', 'abc', '']) {
      expect(COMMISSION_PATTERN.test(bad)).toBe(false);
    }
  });
});
