import { describe, expect, it } from 'vitest';
import { parsePublicEnv } from './env.schema';

describe('parsePublicEnv', () => {
  it('normalises the API base URL', () => {
    expect(
      parsePublicEnv({ NEXT_PUBLIC_API_BASE_URL: 'http://localhost:4000/api/v1/' })
        .NEXT_PUBLIC_API_BASE_URL,
    ).toBe('http://localhost:4000/api/v1');
  });

  it('fails loudly when the API URL is missing or invalid', () => {
    expect(() => parsePublicEnv({})).toThrow(/NEXT_PUBLIC_API_BASE_URL/);
    expect(() => parsePublicEnv({ NEXT_PUBLIC_API_BASE_URL: 'localhost' })).toThrow();
  });
});
