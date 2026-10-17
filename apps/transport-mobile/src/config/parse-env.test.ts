import { normaliseApiBaseUrl } from './parse-env';

describe('normaliseApiBaseUrl', () => {
  it('strips trailing slashes', () => {
    expect(normaliseApiBaseUrl('http://10.0.2.2:4000/api/v1/')).toBe('http://10.0.2.2:4000/api/v1');
  });

  it('rejects missing or malformed values', () => {
    expect(() => normaliseApiBaseUrl(undefined)).toThrow(/EXPO_PUBLIC_API_BASE_URL/);
    expect(() => normaliseApiBaseUrl('localhost:4000')).toThrow();
  });
});
