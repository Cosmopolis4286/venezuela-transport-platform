import { validateDatabaseEnv, validateEnv } from './env.schema.js';

const valid = {
  DATABASE_HOST: '127.0.0.1',
  DATABASE_NAME: 'vtp_dev',
  DATABASE_USER: 'vtp',
  DATABASE_PASSWORD: 'change-me-local-only',
  AUTH_SECRET: 'change-me-local-only-dev-secret-0123456789',
};

const productionValid = {
  ...valid,
  NODE_ENV: 'production',
  DATABASE_PASSWORD: 'a-long-unique-production-password',
  AUTH_SECRET: 'f3c1d0a8b2e94c6f8a7d1e2b3c4d5e6f',
  OTP_DELIVERY: 'disabled',
};

describe('validateEnv', () => {
  it('applies defaults to a minimal valid config', () => {
    const env = validateEnv(valid);
    expect(env).toMatchObject({
      NODE_ENV: 'development',
      API_PORT: 4000,
      DATABASE_PORT: 5432,
      DATABASE_SSL: false,
      CORS_ORIGINS: [],
      SWAGGER_ENABLED: true,
      API_TRUST_PROXY_HOPS: 0,
      RATE_LIMIT_TTL_SECONDS: 60,
      RATE_LIMIT_MAX: 120,
    });
    expect(env.REDIS_URL).toBeUndefined();
  });

  it('parses the CORS allowlist', () => {
    const env = validateEnv({
      ...valid,
      CORS_ORIGINS: 'http://localhost:3000, https://example.com',
    });
    expect(env.CORS_ORIGINS).toEqual(['http://localhost:3000', 'https://example.com']);
  });

  it('reports missing variables by name without echoing values', () => {
    expect(() => validateEnv({ DATABASE_PASSWORD: 'super-secret-value' })).toThrow(/DATABASE_HOST/);
    try {
      validateEnv({ DATABASE_PASSWORD: 'super-secret-value' });
    } catch (error) {
      expect((error as Error).message).not.toContain('super-secret-value');
    }
  });

  it('rejects out-of-range security settings', () => {
    expect(() => validateEnv({ ...valid, RATE_LIMIT_MAX: '0' })).toThrow(/RATE_LIMIT_MAX/);
    expect(() => validateEnv({ ...valid, API_TRUST_PROXY_HOPS: '-1' })).toThrow(
      /API_TRUST_PROXY_HOPS/,
    );
  });

  it('rejects invalid ports and origins', () => {
    expect(() => validateEnv({ ...valid, API_PORT: '99999' })).toThrow(/API_PORT/);
    expect(() => validateEnv({ ...valid, CORS_ORIGINS: 'not-a-url' })).toThrow(/CORS_ORIGINS/);
  });

  it('enforces production safety rules', () => {
    expect(() => validateEnv({ ...valid, NODE_ENV: 'production', CORS_ORIGINS: '*' })).toThrow(
      /CORS_ORIGINS[\s\S]*DATABASE_PASSWORD/,
    );
  });

  it('disables Swagger in production by default', () => {
    expect(validateEnv(productionValid).SWAGGER_ENABLED).toBe(false);
  });

  it('applies authentication defaults', () => {
    expect(validateEnv(valid)).toMatchObject({
      AUTH_ACCESS_TOKEN_TTL_MINUTES: 15,
      AUTH_REFRESH_TOKEN_TTL_DAYS: 30,
      AUTH_RATE_LIMIT_MAX: 10,
      OTP_DELIVERY: 'console',
      OTP_TTL_MINUTES: 5,
      OTP_MAX_ATTEMPTS: 5,
    });
  });

  it('requires a long AUTH_SECRET', () => {
    expect(() => validateEnv({ ...valid, AUTH_SECRET: 'short' })).toThrow(/AUTH_SECRET/);
  });

  it('forbids placeholder secrets and console OTP delivery in production', () => {
    expect(() =>
      validateEnv({
        ...productionValid,
        AUTH_SECRET: 'change-me-local-only-dev-secret-0123456789',
        OTP_DELIVERY: 'console',
      }),
    ).toThrow(/AUTH_SECRET[\s\S]*OTP_DELIVERY/);
    expect(() => validateEnv(productionValid)).not.toThrow();
  });

  it('validates database settings alone for migration tooling', () => {
    const { AUTH_SECRET: _omitted, ...databaseOnly } = valid;
    expect(validateDatabaseEnv(databaseOnly)).toMatchObject({
      DATABASE_PORT: 5432,
      DATABASE_SSL: false,
    });
    expect(() => validateDatabaseEnv({ AUTH_SECRET: valid.AUTH_SECRET })).toThrow(/DATABASE_HOST/);
  });

  it('accepts an empty optional REDIS_URL and rejects a non-redis URL', () => {
    expect(validateEnv({ ...valid, REDIS_URL: '' }).REDIS_URL).toBeUndefined();
    expect(() => validateEnv({ ...valid, REDIS_URL: 'http://localhost' })).toThrow(/REDIS_URL/);
  });
});
