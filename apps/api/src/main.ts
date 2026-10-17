import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module.js';
import { configureApp } from './app.setup.js';
import { AppConfigService } from './config/app-config.service.js';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: true });
  configureApp(app);

  const config = app.get(AppConfigService);
  const host = config.get('API_HOST');
  const port = config.get('API_PORT');
  await app.listen(port, host);

  const logger = app.get(Logger);
  logger.log(`API listening on http://${host}:${port}/api/v1`, 'Bootstrap');
  if (config.get('SWAGGER_ENABLED')) {
    logger.log(`Swagger UI on http://${host}:${port}/api/docs`, 'Bootstrap');
  }
}

await bootstrap();
