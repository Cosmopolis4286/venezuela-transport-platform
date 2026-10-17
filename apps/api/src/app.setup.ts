import { type INestApplication, VersioningType } from '@nestjs/common';
import { Logger } from 'nestjs-pino';
import { HttpExceptionFilter } from './common/filters/http-exception.filter.js';
import { createValidationPipe } from './common/pipes/validation.pipe.js';
import { AppConfigService } from './config/app-config.service.js';
import { setupSwagger } from './docs/swagger.js';

/** Shared by main.ts and the e2e tests so both exercise the same HTTP surface. */
export function configureApp(app: INestApplication): void {
  const config = app.get(AppConfigService);

  app.useLogger(app.get(Logger));
  app.setGlobalPrefix('api');
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
  app.useGlobalPipes(createValidationPipe());
  app.useGlobalFilters(new HttpExceptionFilter());
  app.enableShutdownHooks();

  const origins = config.get('CORS_ORIGINS');
  app.enableCors({
    // Explicit allowlist; an empty list disables cross-origin browser access.
    origin: origins.includes('*') ? true : origins,
    credentials: true,
    exposedHeaders: ['x-request-id'],
  });

  const http = app.getHttpAdapter().getInstance() as { disable?: (setting: string) => void };
  http.disable?.('x-powered-by');

  if (config.get('SWAGGER_ENABLED')) setupSwagger(app);
}
