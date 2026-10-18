import { describe, expect, it } from 'vitest';
import { requiredDocuments } from './onboarding.js';

describe('requiredDocuments', () => {
  it('asks drivers for licence and medical certificate, plus vehicle papers for own vehicles', () => {
    expect(requiredDocuments('driver', false)).toEqual([
      'identity_document',
      'driver_license',
      'medical_certificate',
    ]);
    expect(requiredDocuments('driver', true)).toEqual([
      'identity_document',
      'driver_license',
      'medical_certificate',
      'vehicle_registration',
      'liability_insurance',
    ]);
  });

  it('asks other staff for an identity document only', () => {
    for (const role of ['dispatcher', 'ticket_agent', 'inspector'] as const) {
      expect(requiredDocuments(role, true)).toEqual(['identity_document']);
    }
  });
});
