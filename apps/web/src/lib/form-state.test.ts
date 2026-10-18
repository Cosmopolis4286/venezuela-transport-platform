import { describe, expect, it } from 'vitest';
import { safeNextPath } from './form-state';

describe('safeNextPath', () => {
  it('allows same-site paths only', () => {
    expect(safeNextPath('/portal/organizations/1')).toBe('/portal/organizations/1');
    expect(safeNextPath('https://evil.example')).toBe('/portal');
    expect(safeNextPath('//evil.example')).toBe('/portal');
    expect(safeNextPath('/\\evil.example')).toBe('/portal');
    expect(safeNextPath(null)).toBe('/portal');
  });
});
