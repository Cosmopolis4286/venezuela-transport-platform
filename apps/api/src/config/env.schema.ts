import { z } from 'zod';

const booleanString = z
  .enum(['true', 'false', '1', '0', ''])
  .transform((value) => value === 'true' || value === '1');

const optionalBoolean = (defaultValue: boolean) =>
  booleanString.optional().transform((value) => value ?? defaultValue);

/**
 * Database connection settings alone. Tools that only touch the database (migrations, CLI
 * scripts) validate just these, so they do not need the API's secrets.
 */
const databaseEnvShape = {
  DATABASE_HOST: z.string().min(1),
  DATABASE_PORT: z.coerce.number().int().min(1).max(65535).default(5432),
  DATABASE_NAME: z.string().min(1),
  DATABASE_USER: z.string().min(1),
  DATABASE_PASSWORD: z.string().min(1),
  DATABASE_SSL: optionalBoolean(false),
  DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(100).default(10),
};

export const databaseEnvSchema = z.object(databaseEnvShape);
export type DatabaseEnv = z.output<typeof databaseEnvSchema>;

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

    ...databaseEnvShape,

    /** HMAC key for session-token and OTP hashes. Rotating it signs every user out. */
    AUTH_SECRET: z.string().min(32, 'Must be at least 32 characters'),
    AUTH_ACCESS_TOKEN_TTL_MINUTES: z.coerce.number().int().min(1).max(60).default(15),
    AUTH_REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().min(1).max(90).default(30),
    /** Per-IP limit for login, registration and OTP endpoints, per minute. */
    AUTH_RATE_LIMIT_MAX: z.coerce.number().int().min(1).max(10_000).default(10),
    /**
     * How one-time codes are delivered. `console` prints them to the log (development only);
     * `email` sends e-mail codes through the mailer (SMS / WhatsApp codes are unavailable).
     */
    OTP_DELIVERY: z.enum(['console', 'email', 'disabled']).default('console'),

    /**
     * How e-mail is sent. `console` logs it (development only), `smtp` uses the SMTP_* server
     * (Mailpit in development), `disabled` sends nothing. Default: console outside production,
     * disabled in production.
     */
    MAIL_DELIVERY: z.enum(['console', 'smtp', 'disabled']).optional(),
    SMTP_HOST: z.string().default(''),
    SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(587),
    /** true for implicit TLS (port 465); false upgrades with STARTTLS when the server offers it. */
    SMTP_SECURE: optionalBoolean(false),
    SMTP_USER: z.string().default(''),
    /** Secret. Server-side only. */
    SMTP_PASSWORD: z.string().default(''),
    MAIL_FROM: z.string().default('VTP <no-reply@localhost>'),

    /**
     * How push notifications are sent. `console` logs them (development), `expo` uses the Expo
     * push service, `disabled` sends nothing. Default: console outside production, else disabled.
     */
    PUSH_DELIVERY: z.enum(['console', 'expo', 'disabled']).optional(),
    /** Optional. Expo access token when "enhanced push security" is on. Secret. */
    EXPO_ACCESS_TOKEN: z.string().default(''),
    /** Hours before boarding when passengers get a trip reminder (0 turns reminders off). */
    TRIP_REMINDER_HOURS: z.coerce.number().int().min(0).max(48).default(3),
    OTP_TTL_MINUTES: z.coerce.number().int().min(1).max(30).default(5),
    OTP_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(10).default(5),
    OTP_RESEND_SECONDS: z.coerce.number().int().min(0).max(600).default(60),
    OTP_MAX_PER_HOUR: z.coerce.number().int().min(1).max(100).default(5),

    /** Where uploaded KYC documents are stored. Only `local` exists today; see docs/architecture/onboarding.md. */
    FILE_STORAGE_DRIVER: z.enum(['local']).default('local'),
    /** Directory for the local driver. Relative paths resolve from the API's working directory. */
    FILE_STORAGE_LOCAL_DIR: z.string().min(1).default('var/uploads'),
    FILE_UPLOAD_MAX_BYTES: z.coerce.number().int().min(1024).max(52_428_800).default(10_485_760),

    /** How long held seats wait for payment before they are released. */
    BOOKING_HOLD_MINUTES: z.coerce.number().int().min(5).max(60).default(15),
    /**
     * Who confirms payments. `simulated` (default outside production) shows fake accounts and lets
     * the payer confirm from the app; `disabled` (default in production) turns online payment off
     * until a real provider adapter is configured.
     */
    PAYMENT_PROVIDER: z.enum(['simulated', 'disabled']).optional(),

    REDIS_URL: z
      .union([z.url({ protocol: /^rediss?$/ }), z.literal('')])
      .optional()
      .transform((value) => value || undefined),
  })
  .superRefine((env, ctx) => {
    if (env.MAIL_DELIVERY === 'smtp' && !env.SMTP_HOST) {
      ctx.addIssue({
        code: 'custom',
        path: ['SMTP_HOST'],
        message: 'Required with MAIL_DELIVERY=smtp',
      });
    }
    const mail = env.MAIL_DELIVERY ?? (env.NODE_ENV === 'production' ? 'disabled' : 'console');
    if (env.OTP_DELIVERY === 'email' && mail === 'disabled') {
      ctx.addIssue({
        code: 'custom',
        path: ['OTP_DELIVERY'],
        message: 'E-mail codes need MAIL_DELIVERY=smtp (or console in development)',
      });
    }
    if (env.NODE_ENV !== 'production') return;
    for (const key of ['MAIL_DELIVERY', 'PUSH_DELIVERY'] as const) {
      if (env[key] === 'console') {
        ctx.addIssue({
          code: 'custom',
          path: [key],
          message: 'console delivery writes messages to the logs; use a real provider or disabled',
        });
      }
    }
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
    if (env.PAYMENT_PROVIDER === 'simulated') {
      ctx.addIssue({
        code: 'custom',
        path: ['PAYMENT_PROVIDER'],
        message: 'The simulated provider confirms payments without money; use disabled',
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
    PAYMENT_PROVIDER:
      env.PAYMENT_PROVIDER ?? (env.NODE_ENV === 'production' ? 'disabled' : 'simulated'),
    MAIL_DELIVERY: env.MAIL_DELIVERY ?? (env.NODE_ENV === 'production' ? 'disabled' : 'console'),
    PUSH_DELIVERY: env.PUSH_DELIVERY ?? (env.NODE_ENV === 'production' ? 'disabled' : 'console'),
  }));

export type Env = z.output<typeof envSchema>;

/**
 * Used by ConfigModule. Throws a readable error listing every invalid variable
 * by name only — values are never echoed, so secrets do not leak into logs.
 */
export function validateEnv(raw: Record<string, unknown>): Env {
  return parseOrThrow(envSchema, raw);
}

/** Validates only the DATABASE_* variables (see databaseEnvSchema). */
export function validateDatabaseEnv(raw: Record<string, unknown>): DatabaseEnv {
  return parseOrThrow(databaseEnvSchema, raw);
}

function parseOrThrow<T extends z.ZodType>(schema: T, raw: Record<string, unknown>): z.output<T> {
  const result = schema.safeParse(raw);
  if (!result.success) {
    const problems = result.error.issues
      .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${problems}`);
  }
  return result.data;
}
