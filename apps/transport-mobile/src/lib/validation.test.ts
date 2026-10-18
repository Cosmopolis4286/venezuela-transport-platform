import { isIsoDate } from './validation';

describe('isIsoDate', () => {
  it('accepts real calendar dates only', () => {
    expect(isIsoDate('1990-04-21')).toBe(true);
    expect(isIsoDate('2024-02-29')).toBe(true);
    expect(isIsoDate('2023-02-29')).toBe(false);
    expect(isIsoDate('21/04/1990')).toBe(false);
    expect(isIsoDate('1990-4-21')).toBe(false);
  });
});
