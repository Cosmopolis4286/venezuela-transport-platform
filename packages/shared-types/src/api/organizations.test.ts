import { describe, expect, it } from 'vitest';
import {
  ORGANIZATION_ROLES,
  ORGANIZATION_TYPES,
  ROLES_BY_ORGANIZATION_TYPE,
  roleAllowedFor,
  roleHasPermission,
} from './organizations.js';

describe('organization roles', () => {
  it('gives every organization type an owner and an admin', () => {
    for (const type of ORGANIZATION_TYPES) {
      expect(ROLES_BY_ORGANIZATION_TYPE[type]).toEqual(expect.arrayContaining(['owner', 'admin']));
    }
  });

  it('supports taxi lines without bus-only roles', () => {
    expect(roleAllowedFor('taxi_line', 'driver')).toBe(true);
    expect(roleAllowedFor('taxi_line', 'dispatcher')).toBe(true);
    expect(roleAllowedFor('taxi_line', 'ticket_agent')).toBe(false);
    expect(roleAllowedFor('taxi_line', 'inspector')).toBe(false);
  });

  it('keeps the owner as the only role with every permission', () => {
    expect(roleHasPermission('owner', 'trips.drive')).toBe(true);
    expect(roleHasPermission('admin', 'trips.drive')).toBe(false);
    expect(roleHasPermission('driver', 'members.manage')).toBe(false);
    for (const role of ORGANIZATION_ROLES) {
      expect(roleHasPermission(role, 'members.manage')).toBe(role === 'owner' || role === 'admin');
    }
  });
});
