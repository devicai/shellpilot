import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { LogLevel, Logger, ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { loadConfig } from './config/config.loader';

const LOG_LEVEL_MAP: Record<string, LogLevel> = {
  debug: 'debug',
  info: 'log',
  warn: 'warn',
  error: 'error',
};

async function bootstrap() {
  const config = loadConfig();
  const logger = new Logger('Bootstrap');
  const baseLevel: LogLevel = LOG_LEVEL_MAP[config.logging.level] ?? 'log';
  const levels: LogLevel[] = Array.from(new Set([baseLevel, 'error', 'warn']));

  const app = await NestFactory.create(AppModule, { logger: levels });

  const basePath = config.server.basePath ?? '/api/v1';
  app.setGlobalPrefix(basePath, { exclude: ['health', 'health/ready'] });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  if (config.server.cors?.enabled) {
    app.enableCors({ origin: config.server.cors.origins, credentials: true });
  }

  const swaggerConfig = new DocumentBuilder()
    .setTitle('ShellPilot API')
    .setDescription('Governance and traceability layer for AI agents executing CLIs')
    .setVersion(process.env.npm_package_version ?? '0.1.0')
    .addBearerAuth()
    .addApiKey({ type: 'apiKey', name: 'X-API-Key', in: 'header' }, 'x-api-key')
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup(`${basePath}/docs`, app, document);

  const port = config.server.port ?? 3100;
  await app.listen(port);

  logger.log(`ShellPilot running on port ${port}`);
  logger.log(`API docs: http://localhost:${port}${basePath}/docs`);

  if (config.extensions.properties.length > 0) {
    const exts = config.extensions.properties.map((e) => e.name).join(', ');
    logger.log(`Entity extensions active: ${exts}`);
  } else {
    logger.log('Standalone mode (no entity extensions configured)');
  }
}

bootstrap().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Fatal bootstrap error:', err);
  process.exit(1);
});
