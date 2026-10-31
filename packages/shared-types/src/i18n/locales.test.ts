import { describe, expect, it } from 'vitest';
import { localeFromSegment, localeSegment, matchLocale } from './locales.js';

describe('locales', () => {
  it('matches Accept-Language headers by preference', () => {
    expect(matchLocale('pt-BR,pt;q=0.9,en;q=0.8')).toBe('pt-BR');
    expect(matchLocale('en-US,en;q=0.9,es;q=0.8')).toBe('en');
    expect(matchLocale('fr-FR,fr;q=0.9,en;q=0.5')).toBe('en');
    expect(matchLocale('de, es;q=0.1')).toBe('es');
    expect(matchLocale('es-VE;q=0.2, pt-PT;q=0.9')).toBe('pt-BR');
    expect(matchLocale('en;q=0, pt')).toBe('pt-BR');
  });

  it('matches device language tags and falls back to Spanish', () => {
    expect(matchLocale(['pt-BR', 'en-US'])).toBe('pt-BR');
    expect(matchLocale(['ja-JP'])).toBe('es');
    expect(matchLocale(undefined)).toBe('es');
    expect(matchLocale('')).toBe('es');
  });

  it('maps locales to URL segments and back', () => {
    expect(localeSegment('pt-BR')).toBe('pt-br');
    expect(localeFromSegment('pt-br')).toBe('pt-BR');
    expect(localeFromSegment('EN')).toBe('en');
    expect(localeFromSegment('fr')).toBeNull();
    expect(localeFromSegment(undefined)).toBeNull();
  });
});
