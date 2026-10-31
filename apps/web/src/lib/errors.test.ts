import { describe, expect, it } from 'vitest';
import { errorMessage } from './errors';

describe('errorMessage', () => {
  it('translates known codes and falls back to the API message', () => {
    expect(errorMessage('INVALID_CREDENTIALS', 'Invalid credentials')).toBe(
      'Correo o contraseña incorrectos.',
    );
    expect(
      errorMessage('CONFLICT', 'An organization with this RIF is already registered'),
    ).toContain('RIF');
    expect(errorMessage(undefined)).toContain('error inesperado');
  });

  it('prefers the Spanish message of a reason over the English text', () => {
    expect(errorMessage('CONFLICT', 'This driver is already on a ride', 'DRIVER_BUSY')).toBe(
      'Ese conductor ya está en otro viaje a esa hora.',
    );
  });
});
