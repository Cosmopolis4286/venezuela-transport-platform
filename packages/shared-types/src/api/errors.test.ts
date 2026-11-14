import { describe, expect, it } from 'vitest';
import { API_ERROR_REASON_MESSAGES, API_ERROR_REASONS, isApiErrorResponse } from './errors.js';
import {
  PLATFORM_PERMISSIONS,
  PLATFORM_ROLE_PERMISSIONS,
  platformRoleHasPermission,
  rolesWith,
} from './organizations.js';

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
    expect(rolesWith('operations.dispatch')).toEqual([
      'owner',
      'admin',
      'dispatcher',
      'supervisor',
    ]);
    expect(rolesWith('finance.manage')).toEqual(['owner', 'admin', 'accountant']);
    // Occupancy without money; sales reports also need finance.view.
    expect(rolesWith('reports.view')).toEqual([
      'owner',
      'admin',
      'dispatcher',
      'accountant',
      'supervisor',
    ]);
  });

  it('scopes platform roles: only admins do everything', () => {
    expect(PLATFORM_ROLE_PERMISSIONS.admin).toEqual(PLATFORM_PERMISSIONS);
    expect(platformRoleHasPermission('finance', 'finance.manage')).toBe(true);
    expect(platformRoleHasPermission('finance', 'organizations.review')).toBe(false);
    expect(platformRoleHasPermission('support', 'bookings.search')).toBe(true);
    expect(platformRoleHasPermission('support', 'applications.review')).toBe(false);
    expect(platformRoleHasPermission('support', 'finance.manage')).toBe(false);
    expect(platformRoleHasPermission('reviewer', 'finance.manage')).toBe(false);
    expect(platformRoleHasPermission(null, 'network.view')).toBe(false);
  });
});
