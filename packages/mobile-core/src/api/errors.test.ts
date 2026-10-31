import { afterEach, describe, expect, it } from 'vitest';
import { setActiveLocale } from '../i18n/active-locale';
import { ApiError, userMessage } from './errors';

describe('error messages', () => {
  afterEach(() => setActiveLocale('es'));

  it('follows the language in use', () => {
    const taken = new ApiError(
      409,
      'CONFLICT',
      'One of the seats was just taken',
      [],
      'SEAT_TAKEN',
    );
    expect(taken.userMessage).toMatch(/^Alguien acaba de apartar/);
    setActiveLocale('en');
    expect(taken.userMessage).toMatch(/^Someone just held/);
    setActiveLocale('pt-BR');
    expect(taken.userMessage).toMatch(/^Alguém acabou de reservar/);
    expect(ApiError.network(new Error('offline')).userMessage).toMatch(/Não conseguimos conectar/);
    expect(userMessage('boom')).toBe('Ocorreu um erro inesperado. Tente novamente.');
  });

  it('shows validation details and unknown conflicts as the API sent them', () => {
    const invalid = new ApiError(400, 'VALIDATION_FAILED', 'Request validation failed', [
      { field: 'email', message: 'email must be an email' },
    ]);
    expect(invalid.userMessage).toBe('email must be an email');
    expect(new ApiError(409, 'CONFLICT', 'Route changed').userMessage).toBe('Route changed');
  });
});
