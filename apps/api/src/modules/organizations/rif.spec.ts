import { normalizeRif } from './rif.js';

describe('normalizeRif', () => {
  it.each([
    ['J-12345678-9', 'J-12345678-9'],
    ['j123456789', 'J-12345678-9'],
    [' G-20000001-7 ', 'G-20000001-7'],
    ['V 12345678 0', 'V-12345678-0'],
  ])('normalizes %j', (input, expected) => {
    expect(normalizeRif(input)).toBe(expected);
  });

  it.each(['', 'X-12345678-9', 'J-1234567-9', 'J-123456789-1', 'RIF'])('rejects %j', (input) => {
    expect(normalizeRif(input)).toBeNull();
  });
});
