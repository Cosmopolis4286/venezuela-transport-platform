import { maskContact, normalizeEmail, normalizePhone } from './contact.js';

describe('contact normalization', () => {
  it.each([
    ['0412-1234567', '+584121234567'],
    ['0414 123 4567', '+584141234567'],
    ['+58 424 1234567', '+584241234567'],
    ['+1 650 253 0000', '+16502530000'],
  ])('normalizes phone %s to %s', (input, expected) => {
    expect(normalizePhone(input)).toBe(expected);
  });

  it.each(['', '123', '0412-12', 'not a phone'])('rejects invalid phone %j', (input) => {
    expect(normalizePhone(input)).toBeNull();
  });

  it('normalizes and validates e-mails', () => {
    expect(normalizeEmail('  Maria.Perez@Example.COM ')).toBe('maria.perez@example.com');
    expect(normalizeEmail('no-at-sign')).toBeNull();
    expect(normalizeEmail('a@b')).toBeNull();
  });

  it('masks contacts for display', () => {
    expect(maskContact('phone', '+584121234567')).toBe('+58 *** ***4567');
    expect(maskContact('email', 'maria@example.com')).toBe('m***@example.com');
  });
});
