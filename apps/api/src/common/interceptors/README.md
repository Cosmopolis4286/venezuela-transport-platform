# Interceptors

Cross-cutting interceptors (response mapping, timeouts, caching) live here.
None are registered yet; request IDs and request logging are handled by `nestjs-pino`
(see `src/config/logger.config.ts`). Add an interceptor only when a concrete need appears.
