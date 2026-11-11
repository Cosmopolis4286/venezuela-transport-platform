import { describe, expect, it } from 'vitest';
import { addAmounts, convertAmount, negateAmount, splitVatIncluded } from './fiscal.js';

describe('fiscal amounts', () => {
  it('converts at the BCV rate, half up to cents', () => {
    expect(convertAmount('1.50', '36.5')).toBe('54.75');
    expect(convertAmount('0.11', '36.123456')).toBe('3.97');
    expect(convertAmount('-1.50', '36.5')).toBe('-54.75');
  });

  it('takes the VAT out of an included total for ordinary taxpayers', () => {
    expect(splitVatIncluded('116.00', '16.00', 'ordinary')).toEqual({
      base: '100.00',
      notTaxed: '0.00',
      vatRate: '16.00',
      vat: '16.00',
      total: '116.00',
    });
    const odd = splitVatIncluded('54.75', '16.00', 'ordinary');
    expect(odd).toMatchObject({ base: '47.20', vat: '7.55' });
    expect(Number(odd.base) + Number(odd.vat)).toBeCloseTo(54.75);
    expect(splitVatIncluded('-54.75', '16.00', 'ordinary')).toMatchObject({
      base: '-47.20',
      vat: '-7.55',
    });
  });

  it('records formal taxpayers as not taxed', () => {
    expect(splitVatIncluded('54.75', '16.00', 'formal')).toEqual({
      base: '0.00',
      notTaxed: '54.75',
      vatRate: '0.00',
      vat: '0.00',
      total: '54.75',
    });
  });
});

describe('addAmounts / negateAmount', () => {
  it('adds and flips signs', () => {
    expect(addAmounts('10.50', '-2.25', '0.05')).toBe('8.30');
    expect(addAmounts()).toBe('0.00');
    expect(negateAmount('3.40')).toBe('-3.40');
    expect(negateAmount('0.00')).toBe('0.00');
  });
});
