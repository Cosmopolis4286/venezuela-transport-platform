import { describe, expect, it } from 'vitest';
import { API_ERROR_REASON_MESSAGES, API_ERROR_REASONS, isApiErrorResponse } from './errors.js';
import { rolesWith } from './organizations.js';

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

describe('error reasons', () => {
  it('has a Spanish message for every reason and keeps reasons unique', () => {
    expect(new Set(API_ERROR_REASONS).size).toBe(API_ERROR_REASONS.length);
    for (const reason of API_ERROR_REASONS) {
      expect(API_ERROR_REASON_MESSAGES[reason]).toMatch(/\.$/);
    }
  });

  it('accepts error bodies with a reason', () => {
    expect(
      isApiErrorResponse({
        error: {
          code: 'CONFLICT',
          reason: 'SEAT_TAKEN',
          message: 'One of the seats was just taken',
          timestamp: new Date().toISOString(),
        },
      }),
    ).toBe(true);
  });
});

describe('rolesWith', () => {
  it('lists the roles that hold a permission', () => {
    expect(rolesWith('trips.drive')).toEqual(['owner', 'driver']);
    expect(rolesWith('operations.dispatch')).toEqual(['owner', 'admin', 'dispatcher']);
  });
});
