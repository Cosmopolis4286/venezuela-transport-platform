import { ageOn, normalizeDocumentNumber, normalizePlate, sanitizeFileName } from './validation.js';

describe('onboarding validation', () => {
  it('normalizes cédulas and passports', () => {
    expect(normalizeDocumentNumber('V', 'V-12.345.678')).toBe('12345678');
    expect(normalizeDocumentNumber('E', '84 123 456')).toBe('84123456');
    expect(normalizeDocumentNumber('P', 'ab-123456')).toBe('AB123456');
    expect(normalizeDocumentNumber('V', '12-34')).toBeNull();
    expect(normalizeDocumentNumber('V', 'ABCDEFGH')).toBeNull();
  });

  it('normalizes plates', () => {
    expect(normalizePlate('ab 123 cd')).toBe('AB123CD');
    expect(normalizePlate('A1')).toBeNull();
  });

  it('computes age around the birthday', () => {
    const today = new Date('2026-06-15T12:00:00Z');
    expect(ageOn('2008-06-15', today)).toBe(18);
    expect(ageOn('2008-06-16', today)).toBe(17);
  });

  it('sanitizes file names', () => {
    expect(sanitizeFileName('../../etc/passwd')).toBe('passwd');
    expect(sanitizeFileName('C:\\Users\\x\\cédula "frente".jpg')).toBe('cédula frente.jpg');
    expect(sanitizeFileName('\u0000')).toBe('documento');
    expect(sanitizeFileName('a'.repeat(300))).toHaveLength(120);
  });
});
