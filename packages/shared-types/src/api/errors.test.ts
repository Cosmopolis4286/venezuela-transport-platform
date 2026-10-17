import { describe, expect, it } from 'vitest';
import { isApiErrorResponse } from './errors.js';

describe('isApiErrorResponse', () => {
  it('accepts a well-formed error body', () => {
    expect(
      isApiErrorResponse({
        error: { code: 'NOT_FOUND', message: 'Not found', timestamp: new Date().toISOString() },
      }),
    ).toBe(true);
  });

  it.each([null, 'error', {}, { error: null }, { error: { code: 'NOPE', message: 'x' } }])(
    'rejects %j',
    (value) => {
      expect(isApiErrorResponse(value)).toBe(false);
    },
  );
});
