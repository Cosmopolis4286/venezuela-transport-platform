import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { createRequire } from 'node:module';
import type { Params } from 'nestjs-pino';
import type { Env } from './env.schema.js';

const REQUEST_ID_HEADER = 'x-request-id';
const SAFE_REQUEST_ID = /^[A-Za-z0-9._-]{1,64}$/;

/** pino-pretty is a dev dependency: absent from the production image, even when run locally. */
function prettyAvailable(): boolean {
  try {
    createRequire(import.meta.url).resolve('pino-pretty');
    return true;
  } catch {
    return false;
  }
}

/**
 * Structured JSON logs (pretty-printed in development). Credentials and cookies are
 * redacted; request/response bodies and query strings are never logged.
 */
export function buildLoggerParams(env: Pick<Env, 'LOG_LEVEL' | 'NODE_ENV'>): Params {
  return {
    pinoHttp: {
      level: env.LOG_LEVEL,
      transport:
        env.NODE_ENV === 'development' && prettyAvailable()
          ? { target: 'pino-pretty', options: { singleLine: true, translateTime: 'SYS:standard' } }
          : undefined,
      genReqId: (req: IncomingMessage, res: ServerResponse) => {
        const incoming = req.headers[REQUEST_ID_HEADER];
        const id =
          typeof incoming === 'string' && SAFE_REQUEST_ID.test(incoming) ? incoming : randomUUID();
        res.setHeader(REQUEST_ID_HEADER, id);
        return id;
      },
      redact: {
        paths: [
          'req.headers.authorization',
          'req.headers.cookie',
          'req.headers["x-api-key"]',
          'res.headers["set-cookie"]',
        ],
        censor: '[REDACTED]',
      },
      serializers: {
        req: (req: { id: string; method: string; url: string }) => ({
          id: req.id,
          method: req.method,
          // Drop the query string: it may carry personal data.
          url: req.url.split('?')[0],
        }),
        res: (res: { statusCode: number }) => ({ statusCode: res.statusCode }),
      },
      autoLogging: env.NODE_ENV !== 'test',
    },
  };
}
