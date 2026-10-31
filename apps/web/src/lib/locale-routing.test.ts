import { describe, expect, it } from 'vitest';
import { localeRoute } from './locale-routing';

describe('localeRoute', () => {
  it('keeps prefixed paths and reports their locale', () => {
    expect(localeRoute('/en/buscar', 'es', 'es')).toEqual({ locale: 'en' });
    expect(localeRoute('/pt-br', undefined, null)).toEqual({ locale: 'pt-BR' });
  });

  it('redirects unprefixed paths to the remembered language first', () => {
    expect(localeRoute('/buscar', 'pt-BR', 'en-US')).toEqual({ redirect: '/pt-br/buscar' });
    expect(localeRoute('/', 'en', 'es')).toEqual({ redirect: '/en' });
  });

  it('then follows the browser, then Spanish', () => {
    expect(localeRoute('/', undefined, 'pt-BR,pt;q=0.9')).toEqual({ redirect: '/pt-br' });
    expect(localeRoute('/buscar', 'fr', 'de-DE')).toEqual({ redirect: '/es/buscar' });
    expect(localeRoute('/', undefined, null)).toEqual({ redirect: '/es' });
  });
});
