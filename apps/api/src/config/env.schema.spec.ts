import { validateEnv } from './env.schema.js';

const valid = {
  DATABASE_HOST: '127.0.0.1',
  DATABASE_NAME: 'vtp_dev',
  DATABASE_USER: 'vtp',
  DATABASE_PASSWORD: 'change-me-local-only',
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
    const env = validateEnv({
      ...valid,
      NODE_ENV: 'production',
      DATABASE_PASSWORD: 'a-long-unique-production-password',
    });
    expect(env.SWAGGER_ENABLED).toBe(false);
  });

  it('accepts an empty optional REDIS_URL and rejects a non-redis URL', () => {
    expect(validateEnv({ ...valid, REDIS_URL: '' }).REDIS_URL).toBeUndefined();
    expect(() => validateEnv({ ...valid, REDIS_URL: 'http://localhost' })).toThrow(/REDIS_URL/);
  });
});
