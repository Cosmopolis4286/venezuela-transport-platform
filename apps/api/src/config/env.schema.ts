import { z } from 'zod';

const booleanString = z
  .enum(['true', 'false', '1', '0', ''])
  .transform((value) => value === 'true' || value === '1');

const optionalBoolean = (defaultValue: boolean) =>
  booleanString.optional().transform((value) => value ?? defaultValue);

export const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    /** Reported by the health endpoint. Set to the release tag or git SHA when deploying. */
    APP_VERSION: z.string().min(1).default('0.0.0-dev'),
    API_HOST: z.string().min(1).default('127.0.0.1'),
    API_PORT: z.coerce.number().int().min(1).max(65535).default(4000),
    CORS_ORIGINS: z
      .string()
      .default('')
      .transform((value) =>
        value
          .split(',')
          .map((origin) => origin.trim())
          .filter(Boolean),
      )
      .pipe(z.array(z.union([z.url(), z.literal('*')]))),
    /** Reverse-proxy hops to trust for client IPs (X-Forwarded-For). 0 = no proxy. */
    API_TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(5).default(0),
    /** Global rate limit per client IP: at most RATE_LIMIT_MAX requests per window. */
    RATE_LIMIT_TTL_SECONDS: z.coerce.number().int().min(1).max(3600).default(60),
    RATE_LIMIT_MAX: z.coerce.number().int().min(1).max(100_000).default(120),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),
    SWAGGER_ENABLED: booleanString.optional(),

    DATABASE_HOST: z.string().min(1),
    DATABASE_PORT: z.coerce.number().int().min(1).max(65535).default(5432),
    DATABASE_NAME: z.string().min(1),
    DATABASE_USER: z.string().min(1),
    DATABASE_PASSWORD: z.string().min(1),
    DATABASE_SSL: optionalBoolean(false),
    DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(100).default(10),

    /** HMAC key for session-token and OTP hashes. Rotating it signs every user out. */
    AUTH_SECRET: z.string().min(32, 'Must be at least 32 characters'),
    AUTH_ACCESS_TOKEN_TTL_MINUTES: z.coerce.number().int().min(1).max(60).default(15),
    AUTH_REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().min(1).max(90).default(30),
    /** Per-IP limit for login, registration and OTP endpoints, per minute. */
    AUTH_RATE_LIMIT_MAX: z.coerce.number().int().min(1).max(10_000).default(10),
    /** How one-time codes are delivered. `console` prints them to the log (development only). */
    OTP_DELIVERY: z.enum(['console', 'disabled']).default('console'),
    OTP_TTL_MINUTES: z.coerce.number().int().min(1).max(30).default(5),
    OTP_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(10).default(5),
    OTP_RESEND_SECONDS: z.coerce.number().int().min(0).max(600).default(60),
    OTP_MAX_PER_HOUR: z.coerce.number().int().min(1).max(100).default(5),

    REDIS_URL: z
      .union([z.url({ protocol: /^rediss?$/ }), z.literal('')])
      .optional()
      .transform((value) => value || undefined),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV !== 'production') return;
    if (env.CORS_ORIGINS.includes('*')) {
      ctx.addIssue({
        code: 'custom',
        path: ['CORS_ORIGINS'],
        message: 'Wildcard origins are not allowed in production',
      });
    }
    if (/change-me/i.test(env.AUTH_SECRET)) {
      ctx.addIssue({
        code: 'custom',
        path: ['AUTH_SECRET'],
        message: 'Generate a unique random secret for production',
      });
    }
    if (env.OTP_DELIVERY === 'console') {
      ctx.addIssue({
        code: 'custom',
        path: ['OTP_DELIVERY'],
        message:
          'console delivery prints codes to the logs; configure a real provider or use disabled',
      });
    }
    if (env.DATABASE_PASSWORD.length < 16 || /change-me/i.test(env.DATABASE_PASSWORD)) {
      ctx.addIssue({
        code: 'custom',
        path: ['DATABASE_PASSWORD'],
        message: 'Use a strong, unique password (16+ characters) in production',
      });
    }
  })
  .transform((env) => ({
    ...env,
    // Swagger defaults to on outside production and off in production.
    SWAGGER_ENABLED: env.SWAGGER_ENABLED ?? env.NODE_ENV !== 'production',
  }));

export type Env = z.output<typeof envSchema>;

/**
 * Used by ConfigModule. Throws a readable error listing every invalid variable
 * by name only — values are never echoed, so secrets do not leak into logs.
 */
export function validateEnv(raw: Record<string, unknown>): Env {
  const result = envSchema.safeParse(raw);
  if (!result.success) {
    const problems = result.error.issues
      .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${problems}`);
  }
  return result.data;
}
